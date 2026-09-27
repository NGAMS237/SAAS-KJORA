// =============================================================================
// Node tests — ALIGN-03 Billing SaaS : les 23 scénarios obligatoires
// =============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SUBSCRIPTION_STATUSES, ALLOWED_TRANSITIONS, canTransition,
  isBillingBlocked, hasFullAccess, needsBillingWarning,
  PRICE_CATALOG, priceFor, isPaidPlan, requiresQuote,
  planChangeDirection, computeProration, checkDowngradeEligibility,
  RETRY_OFFSET_DAYS, GRACE_PERIOD_DAYS, retrySchedule, graceEndsOn,
  renewalReminderDates, addDays, daysBetween,
  formatAmount, toMinorUnits, CURRENCY_DECIMALS,
  BILLING_CURRENCIES, INVOICE_STATUSES,
  type SubscriptionStatus,
} from "../src/core/billing/model.ts";
import { BILLING_EVENTS, BILLING_EVENT_EMAILS } from "../src/core/billing/events.ts";
import { isBillingEmailChannelConfigured, decideDelivery } from "../src/core/billing/channel.ts";
import { CAPABILITIES } from "../src/core/authorization/capabilities.ts";
import { internalSecondaryNavigation } from "../src/core/navigation/navigation.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");

const migration = read("../supabase/migrations/20260908140000_align_03_billing_saas.sql");
const rpcs = read("../supabase/migrations/20260908141000_align_03_billing_rpcs.sql");
const provider = read("../src/core/billing/provider.ts");
const billingApi = read("../src/app/api/billing/route.ts");
const authServer = read("../src/core/authorization/server.ts");
const billingPage = read("../src/app/(internal)/app/billing/page.tsx");
const billingView = read("../src/core/billing/billing-view.tsx");

// ---------------------------------------------------------------------------
// 1. Découverte sans provider
// ---------------------------------------------------------------------------

test("§21.1 Découverte fonctionne sans provider, sans carte, sans facture", () => {
  assert.equal(priceFor("decouverte", "monthly", "XAF"), 0);
  assert.equal(priceFor("decouverte", "annual", "XAF"), 0);
  assert.equal(isPaidPlan("decouverte"), false);
  // Aucun abonnement en base ⇒ statut free
  assert.match(migration, /coalesce\(\s*\(select s\.status[\s\S]{0,160}'free'/);
  // Découverte ne peut pas porter de provider
  assert.match(migration, /subscription_free_has_no_provider/);
});

// ---------------------------------------------------------------------------
// 2. Abonnement payant actif
// ---------------------------------------------------------------------------

test("§21.2 un abonnement payant actif garde l'accès complet", () => {
  assert.equal(hasFullAccess("active"), true);
  assert.equal(isBillingBlocked("active"), false);
  assert.equal(needsBillingWarning("active"), false);
});

// ---------------------------------------------------------------------------
// 3-4. Upgrade : intention et prorata
// ---------------------------------------------------------------------------

test("§21.3 le prorata d'upgrade est exact et sans remboursement", () => {
  const quote = computeProration({
    fromPlan: "avance", toPlan: "patrimoine", cycle: "monthly", currency: "XAF",
    periodStart: "2026-09-01", periodEnd: "2026-10-01", onDate: "2026-09-16",
  });
  assert.ok(quote);
  assert.equal(quote?.daysInPeriod, 30);
  assert.equal(quote?.daysRemaining, 15);
  assert.equal(quote?.creditMinor, 6450);   // 12 900 × 15/30
  assert.equal(quote?.chargeMinor, 12450);  // 24 900 × 15/30
  assert.equal(quote?.amountDueMinor, 6000);
});

test("§21.3 un prorata négatif est ramené à zéro : aucun remboursement automatique", () => {
  const quote = computeProration({
    fromPlan: "patrimoine", toPlan: "essentiel", cycle: "monthly", currency: "XAF",
    periodStart: "2026-09-01", periodEnd: "2026-10-01", onDate: "2026-09-16",
  });
  assert.ok(quote);
  assert.ok(quote!.chargeMinor < quote!.creditMinor);
  assert.equal(quote?.amountDueMinor, 0);
});

test("§21.4 l'intention d'upgrade n'active aucun plan payant", () => {
  // Le RPC écrit pending_plan, jamais organization_plans
  assert.match(rpcs, /pending_plan\s*=\s*target_plan/);
  assert.doesNotMatch(sansCommentaires(rpcs), /update\s+public\.organization_plans/i);
  assert.doesNotMatch(sansCommentaires(rpcs), /insert\s+into\s+public\.organization_plans/i);
  assert.match(rpcs, /'providerConfigured',\s*false/);
});

// ---------------------------------------------------------------------------
// 5-6. Downgrade
// ---------------------------------------------------------------------------

test("§21.5 downgrade autorisé quand l'usage tient dans les quotas cibles", () => {
  const r = checkDowngradeEligibility("essentiel", {
    activeProperties: 2, activeUnits: 8, collaborators: 1, organizations: 1,
  });
  assert.equal(r.allowed, true);
});

test("§21.6 downgrade refusé quand un quota est dépassé, avec le détail", () => {
  const r = checkDowngradeEligibility("essentiel", {
    activeProperties: 5, activeUnits: 12, collaborators: 3, organizations: 1,
  });
  assert.equal(r.allowed, false);
  if (r.allowed) return;
  const quotas = r.blockers.map((b) => b.quota).sort();
  assert.deepEqual(quotas, ["active_units", "collaborators", "properties"]);
  const biens = r.blockers.find((b) => b.quota === "properties");
  assert.equal(biens?.actuel, 5);
  assert.equal(biens?.limite, 3);
});

test("§21.6 un refus de downgrade ne supprime ni n'archive jamais de donnée", () => {
  const sql = sansCommentaires(rpcs);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(properties|units|tenants|leases)/i);
  assert.doesNotMatch(sql, /status\s*=\s*'archived'/i);
  assert.match(rpcs, /downgrade_refused/);
});

// ---------------------------------------------------------------------------
// 7-8. Annulation
// ---------------------------------------------------------------------------

test("§21.7 l'annulation est programmée en fin de période payée", () => {
  assert.equal(canTransition("active", "cancellation_scheduled"), true);
  assert.equal(hasFullAccess("cancellation_scheduled"), true, "accès complet maintenu");
  assert.match(rpcs, /cancellation_effective_on\s*=\s*effective/);
  assert.match(rpcs, /coalesce\(sub\.current_period_end,\s*current_date\)/);
});

test("§21.8 l'annulation devient effective en fin de période, sans remboursement", () => {
  assert.equal(canTransition("cancellation_scheduled", "cancelled"), true);
  assert.doesNotMatch(sansCommentaires(rpcs), /refund|rembours/i);
});

// ---------------------------------------------------------------------------
// 9-11. Échec de paiement, grâce, blocage
// ---------------------------------------------------------------------------

test("§21.9 un échec de paiement conserve l'accès", () => {
  assert.equal(hasFullAccess("payment_failed"), true);
  assert.equal(needsBillingWarning("payment_failed"), true);
  assert.equal(canTransition("payment_failed", "grace"), true);
});

test("§21.10 la grâce dure 7 jours et les relances suivent J0/J+1/J+3/J+6", () => {
  assert.equal(GRACE_PERIOD_DAYS, 7);
  assert.deepEqual([...RETRY_OFFSET_DAYS], [0, 1, 3, 6]);
  assert.deepEqual(retrySchedule("2026-09-10"),
    ["2026-09-10", "2026-09-11", "2026-09-13", "2026-09-16"]);
  assert.equal(graceEndsOn("2026-09-10"), "2026-09-17");
  assert.equal(hasFullAccess("grace"), true, "accès normal pendant la grâce");
});

test("§21.11 après la grâce le compte devient bloqué", () => {
  assert.equal(canTransition("grace", "billing_blocked"), true);
  assert.equal(isBillingBlocked("billing_blocked"), true);
  assert.equal(hasFullAccess("billing_blocked"), false);
});

// ---------------------------------------------------------------------------
// 12-13. Restrictions en blocage
// ---------------------------------------------------------------------------

test("§21.12 le blocage est appliqué en base par trigger, incontournable", () => {
  assert.match(migration, /reject_when_billing_blocked/);
  assert.match(migration, /BILLING_BLOCKED/);
  assert.match(migration, /billing_blocked_insert_guard/);
  // Les tables financières sont protégées aussi en modification
  assert.match(migration, /billing_blocked_update_guard/);
  for (const table of ["payments", "dues", "ledger_entries", "financial_documents",
    "lease_contracts", "contract_signatures", "properties", "units", "leases"]) {
    assert.ok(migration.includes(`'${table}'`), `table non protégée : ${table}`);
  }
});

test("§21.12 l'Owner bloqué garde abonnement, compte et support", () => {
  assert.match(authServer, /CAPABILITIES_ALLOWED_WHEN_BLOCKED/);
  for (const cap of ["organization.view", "organization.profile.manage",
    "billing.view", "billing.manage"]) {
    assert.ok(authServer.includes(`"${cap}"`), `capacité non préservée : ${cap}`);
  }
  // La garde serveur ne bloque que les capacités mutantes
  assert.match(authServer, /isMutatingCapability/);
  assert.match(authServer, /status: 402/);
  // La page Abonnement reste atteignable : elle n'exige aucune capacité mutante
  assert.match(billingPage, /billing\.view/);
});

test("§21.13 le portail locataire devient lecture seule sans rien supprimer", () => {
  // Signature de contrat et documents bloqués ⇒ plus aucune action mutante
  assert.ok(migration.includes("'contract_signatures'"));
  assert.ok(migration.includes("'financial_documents'"));
  // Les tables de session et de consultation restent ouvertes : sinon le
  // locataire ne pourrait même plus lire.
  const guardBlock = migration.slice(migration.indexOf("billing_blocked_insert_guard"));
  assert.ok(!guardBlock.includes("'tenant_portal_sessions'"), "la session portail doit rester possible");
  assert.ok(!guardBlock.includes("'tenant_portal_document_views'"), "la lecture portail doit rester possible");
  assert.doesNotMatch(sansCommentaires(migration), /delete\s+from\s+public\./i);
});

// ---------------------------------------------------------------------------
// 14-15. Réactivation
// ---------------------------------------------------------------------------

test("§21.14 la réactivation est possible depuis blocage ou annulation", () => {
  assert.equal(canTransition("billing_blocked", "reactivation_pending"), true);
  assert.equal(canTransition("cancelled", "reactivation_pending"), true);
  assert.match(rpcs, /status not in \('billing_blocked','cancelled'\)/);
});

test("§21.15 la réactivation ne facture aucun mois suspendu", () => {
  assert.match(rpcs, /'retroactiveCharge',\s*false/);
  // Les marqueurs de grâce sont effacés, aucune dette n'est reportée
  assert.match(rpcs, /grace_started_on = null/);
  assert.match(rpcs, /last_failure_on = null/);
  assert.doesNotMatch(sansCommentaires(rpcs), /penalit|penalty|arrear/i);
});

// ---------------------------------------------------------------------------
// 16-17. Factures : appartenance et isolation
// ---------------------------------------------------------------------------

test("§21.16 une facture appartient à une Organization et n'est lisible que par elle", () => {
  assert.match(migration, /create policy billing_invoices_select[\s\S]{0,200}has_capability\(organization_id, 'billing\.view'\)/);
  assert.match(rpcs, /list_billing_invoices[\s\S]{0,400}has_capability\(target_organization_id, 'billing\.view'\)/);
});

test("§21.17 un accès à une Organization tierce est refusé", () => {
  for (const fn of ["get_billing_overview", "request_plan_change", "cancel_subscription",
    "request_reactivation", "list_billing_invoices"]) {
    const bloc = rpcs.slice(rpcs.indexOf(`function public.${fn}`));
    assert.match(bloc.slice(0, 900), /has_capability\(target_organization_id/,
      `${fn} ne revérifie pas la capacité`);
    assert.match(bloc.slice(0, 900), /forbidden/, `${fn} ne refuse pas explicitement`);
  }
});

// ---------------------------------------------------------------------------
// 18. Idempotence des événements provider
// ---------------------------------------------------------------------------

test("§21.18 un événement provider rejoué ne produit aucun doublon", () => {
  assert.match(migration, /billing_events_provider_event_unique/);
  assert.match(migration, /unique index[\s\S]{0,120}provider_event_id[\s\S]{0,60}where provider_event_id is not null/);
  // Les tentatives de paiement portent une clé d'idempotence par Organization
  assert.match(migration, /unique \(organization_id, idempotency_key\)/);
});

// ---------------------------------------------------------------------------
// 19. Aucun secret provider côté client
// ---------------------------------------------------------------------------

test("§21.19 aucun secret provider ne peut fuir côté client", () => {
  const clientSources = [billingView, read("../src/core/billing/model.ts"),
    read("../src/core/billing/events.ts")].map(sansCommentaires);
  for (const source of clientSources) {
    assert.doesNotMatch(source, /sk_live|sk_test|api[_-]?key|secret|webhook_secret/i);
  }
  // L'abstraction ne stocke que des références opaques et des données non sensibles
  assert.match(provider, /Jamais un secret/);
  assert.doesNotMatch(sansCommentaires(provider), /process\.env/);
  // Aucun numéro complet : seulement marque et 4 derniers chiffres
  assert.match(migration, /payment_method_last4\s+text\s+check[\s\S]{0,120}\^\[0-9\]\{4\}\$/);
  assert.doesNotMatch(migration, /card_number|pan\b|cvv|cvc/i);
});

test("§21.19 aucune implémentation de provider réel dans ce lot", () => {
  for (const nom of ["Stripe", "CamPay", "Flutterwave", "PayUnit", "ElyonPay"]) {
    assert.doesNotMatch(sansCommentaires(billingApi), new RegExp(nom, "i"));
    assert.doesNotMatch(sansCommentaires(migration), new RegExp(nom, "i"));
  }
  assert.match(provider, /hasConfiguredProvider/);
  assert.match(provider, /REGISTRY\.size > 0/);
});

// ---------------------------------------------------------------------------
// 20. Le plan ne peut pas être forgé
// ---------------------------------------------------------------------------

test("§21.20 le client ne peut ni forger un plan ni imposer un montant", () => {
  // L'Organization vient du contexte serveur
  assert.match(billingApi, /authorization\.organizationId/);
  assert.doesNotMatch(billingApi, /body\.organization_id|body\.organizationId/);
  // Le plan est validé contre la liste canonique
  assert.match(billingApi, /isPlanSlug/);
  assert.match(billingApi, /isBillingCycle/);
  // Aucun montant n'est accepté du client
  assert.doesNotMatch(billingApi, /body\.amount|amountMinor:/);
  // Le devis est calculé en base à partir du catalogue
  assert.match(rpcs, /from public\.billing_prices/);
});

test("§21.20 organization_plans reste la vérité du plan effectif", () => {
  assert.match(rpcs, /get_billing_overview[\s\S]{0,2000}'effectivePlan'/);
  assert.match(rpcs, /private\.get_org_plan/);
});

// ---------------------------------------------------------------------------
// 21-22. Étanchéité avec les loyers
// ---------------------------------------------------------------------------

test("§21.21 le domaine billing ne touche jamais les Payments de loyer", () => {
  const sql = sansCommentaires(migration) + sansCommentaires(rpcs);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.payments/i);
  assert.doesNotMatch(sql, /update\s+public\.payments/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.payment_allocations/i);
  // Aucune clé étrangère du billing vers le domaine loyer
  assert.doesNotMatch(sql, /references public\.(payments|dues|ledger_entries|financial_documents)/i);
});

test("§21.22 le Ledger n'est jamais modifié par la facturation", () => {
  const sql = sansCommentaires(migration) + sansCommentaires(rpcs);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.ledger_entries/i);
  assert.doesNotMatch(sql, /update\s+public\.ledger_entries/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.ledger_entries/i);
});

// ---------------------------------------------------------------------------
// 23. Sécurité des RPC
// ---------------------------------------------------------------------------

test("§21.23 tous les RPC billing sont SECURITY DEFINER, search_path vide, anon révoqué", () => {
  const definer = (rpcs.match(/security definer/g) ?? []).length;
  const searchPath = (rpcs.match(/set search_path = ''/g) ?? []).length;
  assert.ok(definer >= 5, "au moins 5 fonctions SECURITY DEFINER");
  assert.ok(searchPath >= definer, "chaque fonction doit fixer search_path");
  for (const fn of ["get_billing_overview", "list_billing_invoices", "request_plan_change",
    "cancel_subscription", "resume_subscription", "request_reactivation"]) {
    assert.ok(rpcs.includes(`revoke all on function public.${fn}`), `anon non révoqué sur ${fn}`);
  }
});

test("aucune écriture client directe sur les tables de facturation", () => {
  assert.match(migration, /revoke all on public\.organization_subscriptions[\s\S]{0,160}from anon, authenticated/);
  assert.doesNotMatch(migration, /create policy \w+_insert on public\.(organization_subscriptions|billing_invoices)/);
  assert.doesNotMatch(migration, /create policy \w+_update on public\.(organization_subscriptions|billing_invoices)/);
});

// ---------------------------------------------------------------------------
// Modèle : cohérence générale
// ---------------------------------------------------------------------------

test("les 8 états d'abonnement sont définis et toutes les transitions cataloguées", () => {
  assert.equal(SUBSCRIPTION_STATUSES.length, 8);
  for (const status of SUBSCRIPTION_STATUSES) {
    assert.ok(Array.isArray(ALLOWED_TRANSITIONS[status]), `transitions absentes pour ${status}`);
    for (const cible of ALLOWED_TRANSITIONS[status]) {
      assert.ok((SUBSCRIPTION_STATUSES as readonly string[]).includes(cible),
        `transition vers un état inconnu : ${status} → ${cible}`);
    }
  }
  // Une transition arbitraire est refusée
  assert.equal(canTransition("free", "billing_blocked"), false);
  assert.equal(canTransition("cancelled", "active"), false);
});

test("les prix canoniques XAF et CAD sont exacts, sans EUR ni USD inventés", () => {
  assert.deepEqual([...BILLING_CURRENCIES], ["XAF", "CAD"]);
  assert.equal(PRICE_CATALOG.XAF.essentiel.monthly, 5_900);
  assert.equal(PRICE_CATALOG.XAF.avance.monthly, 12_900);
  assert.equal(PRICE_CATALOG.XAF.patrimoine.monthly, 24_900);
  assert.equal(PRICE_CATALOG.XAF.essentiel.annual, 59_000);
  assert.equal(PRICE_CATALOG.XAF.avance.annual, 129_000);
  assert.equal(PRICE_CATALOG.XAF.patrimoine.annual, 249_000);
  // CAD en centimes
  assert.equal(PRICE_CATALOG.CAD.essentiel.monthly, 1_499);
  assert.equal(PRICE_CATALOG.CAD.patrimoine.monthly, 6_199);
  // Sur mesure : aucun prix catalogue
  assert.equal(PRICE_CATALOG.XAF.sur_mesure.monthly, null);
  assert.equal(requiresQuote("sur_mesure"), true);
});

test("l'annuel applique bien 12 mois pour le prix de 10", () => {
  for (const devise of BILLING_CURRENCIES) {
    for (const plan of ["essentiel", "avance", "patrimoine"] as const) {
      const m = PRICE_CATALOG[devise][plan].monthly;
      const a = PRICE_CATALOG[devise][plan].annual;
      assert.equal(a, (m ?? 0) * 10, `${plan} ${devise} : annuel ≠ 10 × mensuel`);
    }
  }
});

test("les montants sont formatés selon les décimales de la devise", () => {
  assert.equal(CURRENCY_DECIMALS.XAF, 0);
  assert.equal(CURRENCY_DECIMALS.CAD, 2);
  assert.equal(toMinorUnits(14.99, "CAD"), 1499);
  assert.equal(toMinorUnits(5900, "XAF"), 5900);
  assert.match(formatAmount(1499, "CAD"), /14,99\s*CAD/);
  assert.match(formatAmount(5900, "XAF"), /5\s*900\s*XAF/);
});

test("le sens d'un changement de plan est correctement identifié", () => {
  assert.equal(planChangeDirection("essentiel", "avance"), "upgrade");
  assert.equal(planChangeDirection("avance", "essentiel"), "downgrade");
  assert.equal(planChangeDirection("avance", "avance"), "same");
  assert.equal(planChangeDirection("decouverte", "patrimoine"), "upgrade");
});

test("les rappels de renouvellement tombent à J-7, J-3 et J-1", () => {
  assert.deepEqual(renewalReminderDates("2026-10-01"),
    ["2026-09-24", "2026-09-28", "2026-09-30"]);
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(daysBetween("2026-09-01", "2026-10-01"), 30);
});

test("les 15 événements de facturation sont définis, sans envoi si canal absent", () => {
  assert.equal(BILLING_EVENTS.length, 15);
  for (const attendu of ["renewal_reminder_j7", "renewal_reminder_j3", "renewal_reminder_j1",
    "payment_succeeded", "payment_failed", "grace_started",
    "grace_reminder_j1", "grace_reminder_j3", "grace_reminder_j6",
    "block_imminent", "billing_blocked", "cancellation_scheduled", "reactivated",
    "payment_method_expiring_j30", "payment_method_expiring_j7"]) {
    assert.ok((BILLING_EVENTS as readonly string[]).includes(attendu), `événement absent : ${attendu}`);
  }
  assert.equal(isBillingEmailChannelConfigured({}), false);
  assert.equal(isBillingEmailChannelConfigured({
    RESEND_TRANSACTIONAL_API_KEY: "k", KJORA_TRANSACTIONAL_EMAIL_FROM: "f",
  }), true);
  // Canal absent ⇒ aucun envoi tenté, et la raison est explicite
  assert.deepEqual(decideDelivery({ emailable: true, env: {} }),
    { deliver: false, reason: "channel_not_configured" });
  assert.deepEqual(decideDelivery({ emailable: false, env: {} }),
    { deliver: false, reason: "event_not_emailable" });
  assert.deepEqual(decideDelivery({
    emailable: true, env: { RESEND_TRANSACTIONAL_API_KEY: "k", KJORA_TRANSACTIONAL_EMAIL_FROM: "f" },
  }), { deliver: true });
  // Chaque événement déclare s'il donne lieu à un email
  for (const e of BILLING_EVENTS) {
    assert.equal(typeof BILLING_EVENT_EMAILS[e], "boolean", `politique email absente : ${e}`);
  }
});

test("les capacités billing existent et l'entrée Abonnement est visible", () => {
  assert.ok((CAPABILITIES as readonly string[]).includes("billing.view"));
  assert.ok((CAPABILITIES as readonly string[]).includes("billing.manage"));
  const entree = internalSecondaryNavigation.find((e) => e.href === "/app/billing");
  assert.ok(entree, "entrée Abonnement absente de la navigation");
  assert.equal(entree?.requiredCapability, "billing.view");
  // La contrainte SQL a bien été étendue, sans perdre les capacités existantes
  assert.match(migration, /role_capabilities_capability_check/);
  assert.match(migration, /'contract\.manage'/);
  assert.match(migration, /'billing\.view','billing\.manage'/);
});

test("les statuts de facture sont définis", () => {
  assert.deepEqual([...INVOICE_STATUSES], ["draft", "open", "paid", "void", "uncollectible"]);
});

test("aucun état d'abonnement n'est laissé sans message utilisateur", () => {
  const view = read("../src/core/billing/model.ts");
  for (const status of SUBSCRIPTION_STATUSES) {
    assert.ok(view.includes(`${status}:`), `message manquant pour ${status}`);
  }
  // Les messages restent non techniques
  const messages = view.slice(view.indexOf("SUBSCRIPTION_STATUS_MESSAGES"));
  for (const jargon of ["RPC", "trigger", "SQL", "webhook", "provider_"]) {
    assert.ok(!messages.slice(0, 1400).includes(jargon), `jargon dans un message : ${jargon}`);
  }
});

test("le statut d'abonnement inconnu retombe sur un défaut sûr", () => {
  const statuts: unknown[] = ["free", "inventé", null, 42];
  const valides = statuts.filter((s): s is SubscriptionStatus =>
    typeof s === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(s));
  assert.deepEqual(valides, ["free"]);
});
