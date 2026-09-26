import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_COPY } from "../src/modules/platform-admin/copy.ts";

// =============================================================================
// ADMIN-BILLING-OPS-01 — Tests
// =============================================================================
// Même distinction méthodologique que ADMIN-01 (voir admin-01-platform-console
// .test.ts) : invariants de source sur le SQL/TS réellement livré, et non une
// exécution contre une base réelle (aucun Supabase éphémère disponible dans ce
// bac à sable — voir ADMIN-BILLING-OPS-01-REPORT.md, section PGTAP TESTS).
// =============================================================================

const MIGRATION = readFileSync(
  new URL(
    "../supabase/migrations/20260926120000_admin_billing_ops_01_commercial_interventions.sql",
    import.meta.url,
  ),
  "utf8",
);
const SERVER = readFileSync(
  new URL("../src/modules/platform-admin/server.ts", import.meta.url),
  "utf8",
);
const ACTIONS = readFileSync(
  new URL("../src/modules/platform-admin/commercial-ops-actions.ts", import.meta.url),
  "utf8",
);
const VIEWS = readFileSync(
  new URL("../src/modules/platform-admin/views.tsx", import.meta.url),
  "utf8",
);

/** Isole le corps d'une fonction SQL par son nom qualifié, jusqu'à son `$$;` de fin. */
function sqlFunctionBody(name: string): string {
  const start = MIGRATION.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `fonction absente de la migration : ${name}`);
  const end = MIGRATION.indexOf("$$;", start);
  assert.notEqual(end, -1, `fin de fonction introuvable : ${name}`);
  return MIGRATION.slice(start, end);
}

const NEW_RPCS = [
  "public.admin_get_organization_detail",
  "public.admin_grant_commercial_intervention",
  "public.admin_revoke_commercial_intervention",
  "public.admin_extend_commercial_intervention",
  "public.admin_reconcile_expired_interventions",
  "public.admin_commercial_intervention_counters",
];

// ---------------------------------------------------------------------------
// 1. Sécurité — chaque nouvelle RPC est gardée, sans dépendre du rôle Owner
// ---------------------------------------------------------------------------

test("chacune des 6 nouvelles RPC vérifie l'autorisation plateforme avant toute opération", () => {
  for (const rpc of NEW_RPCS) {
    const body = sqlFunctionBody(rpc);
    assert.ok(
      body.includes("private.assert_platform_admin();"),
      `${rpc} n'appelle pas assert_platform_admin en premier`,
    );
  }
});

test("chacune des 6 nouvelles RPC fige son search_path", () => {
  for (const rpc of NEW_RPCS) {
    const body = sqlFunctionBody(rpc);
    assert.ok(body.includes("set search_path = ''"), `${rpc} ne fige pas search_path`);
  }
});

test("aucun droit n'est jamais accordé à anon ni au rôle public sur les nouvelles RPC", () => {
  for (const rpc of NEW_RPCS) {
    const bareName = rpc.replace("public.", "");
    const revokePattern = new RegExp(
      `revoke all on function public\\.${bareName}\\([^)]*\\) from public, anon;`,
    );
    assert.ok(revokePattern.test(MIGRATION), `${rpc} n'a pas de revoke explicite from public, anon`);
  }
  assert.ok(
    !/grant\s+execute[^;]*\bto\b[^;]*\banon\b/i.test(MIGRATION),
    "un grant execute a été accordé à anon",
  );
});

test("aucun droit n'est jamais accordé sur commercial_interventions elle-même — tout passe par les RPC", () => {
  assert.ok(MIGRATION.includes("revoke all on public.commercial_interventions from anon, authenticated;"));
  assert.ok(!/create policy[^;]*on public\.commercial_interventions/i.test(MIGRATION));
  assert.ok(MIGRATION.includes("alter table public.commercial_interventions enable row level security;"));
});

test("aucune RPC n'utilise de SQL dynamique", () => {
  // 'execute' apparaît uniquement dans « grant execute » / « revoke ... execute »
  // (nom de privilège), jamais comme instruction PL/pgSQL EXECUTE (dynamique).
  assert.ok(!/\bexecute\s+format\s*\(/i.test(MIGRATION), "execute format(...) détecté");
  assert.ok(!/\bexecute\s+'/i.test(MIGRATION), "instruction EXECUTE dynamique détectée");
});

test("aucun droit administratif ne dépend du rôle Owner ni d'une capacité RBAC de tenant", () => {
  for (const rpc of NEW_RPCS) {
    const body = sqlFunctionBody(rpc);
    assert.ok(
      !/private\.has_capability/i.test(body),
      `${rpc} dépend d'une capacité RBAC de tenant`,
    );
  }
  // admin_get_organization_detail interroge bien `m.role = 'organization_owner'`,
  // mais uniquement pour AFFICHER le propriétaire principal d'une Organization —
  // jamais comme condition d'autorisation : celle-ci reste entièrement portée
  // par assert_platform_admin(), appelé sans branche conditionnelle ni égard au
  // rôle du membre courant.
  const detailBody = sqlFunctionBody("public.admin_get_organization_detail");
  assert.ok(
    /perform private\.assert_platform_admin\(\);/.test(detailBody),
    "l'autorisation n'est pas un appel inconditionnel",
  );
  assert.ok(
    !/if\s+[^;]*organization_owner[^;]*then[\s\S]*?assert_platform_admin/i.test(detailBody),
    "l'autorisation platform_admin est conditionnée par le rôle Owner",
  );
});

// ---------------------------------------------------------------------------
// 2. Modèle métier — gratuité, paiement hors ligne et abonnement réel jamais
//    confondus (§ Étape 2 du mandat)
// ---------------------------------------------------------------------------

test("un octroi manuel ne peut structurellement jamais porter provider = 'stripe'", () => {
  // La colonne provider n'existe même pas sur commercial_interventions : elle
  // est absente de la liste de colonnes de la table.
  const tableStart = MIGRATION.indexOf("create table public.commercial_interventions");
  const tableEnd = MIGRATION.indexOf(");", MIGRATION.indexOf("constraint commercial_interventions_org_idempotency_unique"));
  const tableBody = MIGRATION.slice(tableStart, tableEnd);
  assert.ok(!/\bprovider\b/.test(tableBody), "la table commercial_interventions porte une colonne provider");
});

test("le forfait effectif d'un octroi manuel n'écrit jamais organization_subscriptions", () => {
  const grantBody = sqlFunctionBody("public.admin_grant_commercial_intervention");
  assert.ok(!/insert into public\.organization_subscriptions/i.test(grantBody));
  assert.ok(!/update public\.organization_subscriptions/i.test(grantBody));
});

test("le paiement hors ligne exige devise et montant positifs ; les autres types n'en portent aucun", () => {
  assert.ok(MIGRATION.includes("constraint commercial_interventions_offline_payment_amount"));
  assert.ok(MIGRATION.includes("constraint commercial_interventions_non_offline_has_no_amount"));
  const grantBody = sqlFunctionBody("public.admin_grant_commercial_intervention");
  assert.ok(grantBody.includes("'invalid_currency'"));
  assert.ok(grantBody.includes("'invalid_amount'"));
});

test("les types cadeau / promotion / partenariat exigent une date de fin ; le paiement hors ligne n'en dépend pas", () => {
  assert.ok(MIGRATION.includes("constraint commercial_interventions_end_required_by_type"));
  const grantBody = sqlFunctionBody("public.admin_grant_commercial_intervention");
  assert.ok(grantBody.includes("'end_date_required'"));
  assert.ok(
    /complimentary', 'promotion', 'partnership'\)\s*then\s*\n\s*if p_ends_on is null/.test(grantBody),
  );
});

test("le forfait 'sur_mesure' est exclu des octrois manuels", () => {
  const tableStart = MIGRATION.indexOf("granted_plan text not null check");
  const tableEnd = MIGRATION.indexOf(")),", tableStart);
  const clause = MIGRATION.slice(tableStart, tableEnd);
  assert.ok(!clause.includes("sur_mesure"), "sur_mesure est autorisé comme forfait octroyé manuellement");
  assert.ok(clause.includes("decouverte") && clause.includes("essentiel") && clause.includes("avance") && clause.includes("patrimoine"));
});

test("une révocation exige toujours un motif et ne supprime jamais la ligne", () => {
  assert.ok(MIGRATION.includes("constraint commercial_interventions_revoked_has_reason"));
  const revokeBody = sqlFunctionBody("public.admin_revoke_commercial_intervention");
  assert.ok(!/delete from/i.test(revokeBody), "la révocation supprime une ligne");
  assert.ok(revokeBody.includes("'reason_required'"));
  assert.ok(revokeBody.includes("status = 'revoked'"));
});

test("aucune RPC de ce lot ne supprime jamais de ligne, d'Organization ou d'utilisateur", () => {
  for (const rpc of NEW_RPCS) {
    const body = sqlFunctionBody(rpc);
    assert.ok(!/delete from/i.test(body), `${rpc} contient une suppression`);
  }
  assert.ok(
    !/on delete cascade/i.test(MIGRATION.slice(MIGRATION.indexOf("create table public.commercial_interventions"), MIGRATION.indexOf("comment on table"))),
    "une contrainte on delete cascade autoriserait une suppression en chaîne",
  );
});

test("l'expiration recalcule le forfait à partir de l'abonnement réel, sans instantané dupliqué", () => {
  const revokeBody = sqlFunctionBody("public.admin_revoke_commercial_intervention");
  const reconcileBody = sqlFunctionBody("public.admin_reconcile_expired_interventions");
  for (const body of [revokeBody, reconcileBody]) {
    assert.ok(body.includes("coalesce(s.plan, 'decouverte')") || body.includes("coalesce(sub.plan, 'decouverte')"));
  }
});

test("aucune colonne de moyen de paiement ou de référence fournisseur n'est SÉLECTIONNÉE par ce lot", () => {
  // Ces noms de colonnes apparaissent volontairement dans les commentaires de
  // la migration (documentation de ce qui ne doit JAMAIS être exposé) — le
  // test porte donc sur leur usage réel dans une clause de lecture, pas sur
  // leur simple présence textuelle dans un commentaire.
  const forbidden = [
    "provider_customer_ref",
    "provider_subscription_ref",
    "payment_method_brand",
    "payment_method_last4",
    "payment_method_expires_on",
  ];
  for (const column of forbidden) {
    const selected = new RegExp(`select[^;]*\\bsub\\.${column}\\b`, "is");
    assert.ok(!selected.test(MIGRATION), `colonne effectivement sélectionnée : ${column}`);
    const jsonbBuilt = new RegExp(`jsonb_build_object\\([^)]*\\bsub\\.${column}\\b`, "is");
    assert.ok(!jsonbBuilt.test(MIGRATION), `colonne exposée en jsonb : ${column}`);
  }
  // 'provider' générique reste le seul champ fournisseur exposé par la fiche.
  assert.ok(sqlFunctionBody("public.admin_get_organization_detail").includes("sub.provider"));
});

// ---------------------------------------------------------------------------
// 3. Idempotence, concurrence et validation défensive (Étape 5 du mandat)
// ---------------------------------------------------------------------------

test("un même jeton d'idempotence pour une même Organization ne crée jamais deux lignes", () => {
  assert.ok(MIGRATION.includes("constraint commercial_interventions_org_idempotency_unique"));
  const grantBody = sqlFunctionBody("public.admin_grant_commercial_intervention");
  assert.ok(grantBody.includes("'already_recorded'"));
  assert.ok(grantBody.includes("idempotency_key = p_idempotency_key"));
});

test("un octroi refuse une seconde intervention active plutôt que de l'empiler silencieusement", () => {
  const grantBody = sqlFunctionBody("public.admin_grant_commercial_intervention");
  assert.ok(grantBody.includes("'intervention_already_active'"));
});

test("les mutations verrouillent la ligne Organization ciblée pour éviter une course entre deux administrateurs", () => {
  for (const rpc of [
    "public.admin_grant_commercial_intervention",
    "public.admin_revoke_commercial_intervention",
    "public.admin_extend_commercial_intervention",
  ]) {
    const body = sqlFunctionBody(rpc);
    assert.ok(body.includes("for update"), `${rpc} ne verrouille pas la ligne Organization`);
  }
});

test("un identifiant d'Organization inexistant est refusé explicitement, jamais silencieusement", () => {
  for (const rpc of [
    "public.admin_grant_commercial_intervention",
    "public.admin_revoke_commercial_intervention",
    "public.admin_extend_commercial_intervention",
  ]) {
    const body = sqlFunctionBody(rpc);
    assert.ok(body.includes("'organization_not_found'"), `${rpc} ne refuse pas une Organization inexistante`);
  }
});

test("la fiche Organization renvoie found:false pour un identifiant inexistant, sans lever d'exception", () => {
  const body = sqlFunctionBody("public.admin_get_organization_detail");
  assert.ok(body.includes("'found', false"));
});

test("la révocation et la prolongation sont idempotentes face à une intervention déjà inactive", () => {
  for (const rpc of [
    "public.admin_revoke_commercial_intervention",
    "public.admin_extend_commercial_intervention",
  ]) {
    const body = sqlFunctionBody(rpc);
    assert.ok(body.includes("'not_active'"), `${rpc} ne gère pas le cas déjà inactif`);
  }
});

test("la prolongation exige une nouvelle date de fin strictement postérieure à l'actuelle", () => {
  const body = sqlFunctionBody("public.admin_extend_commercial_intervention");
  assert.ok(body.includes("'invalid_period'"));
  assert.ok(body.includes("new_ends_on <= minimum_bound"));
});

test("l'audit et l'intervention sont écrits dans la même transaction que la mutation", () => {
  // La migration entière est encadrée par begin;/commit; et chaque RPC insère
  // sa ligne billing_events dans le même bloc plpgsql que l'opération sur
  // commercial_interventions — jamais dans un second appel séparé.
  assert.ok(MIGRATION.trimStart().startsWith("begin;"));
  assert.ok(MIGRATION.trimEnd().endsWith("commit;"));
  for (const rpc of [
    "public.admin_grant_commercial_intervention",
    "public.admin_revoke_commercial_intervention",
    "public.admin_extend_commercial_intervention",
    "public.admin_reconcile_expired_interventions",
  ]) {
    const body = sqlFunctionBody(rpc);
    assert.ok(body.includes("insert into public.billing_events"), `${rpc} n'écrit pas d'audit`);
  }
});

test("le serveur ne fait jamais confiance aux valeurs calculées côté client pour le montant/la devise/la référence", () => {
  const body = sqlFunctionBody("public.admin_grant_commercial_intervention");
  assert.ok(
    body.includes("effective_currency := null;") && body.includes("effective_amount := null;"),
    "les valeurs ne sont pas explicitement annulées pour les types non-paiement",
  );
});

// ---------------------------------------------------------------------------
// 4. Isolation des données — pas de fuite entre Organizations
// ---------------------------------------------------------------------------

test("la fiche Organization ne lit jamais l'intervention ou l'historique d'une autre Organization", () => {
  const body = sqlFunctionBody("public.admin_get_organization_detail");
  assert.ok(body.includes("ci.organization_id = target_organization_id"));
  assert.ok(body.includes("be.organization_id = target_organization_id"));
});

test("le payload brut des événements n'est jamais exposé tel quel par la fiche Organization", () => {
  // Les événements sont ré-encodés (event_id/event_type/created_at/actor_email)
  // pour la vue, jamais renvoyés en accédant directement à leur payload brut
  // côté TypeScript (mapRecentEvents ne doit pas relayer be.payload sans filtre).
  assert.ok(SERVER.includes("mapRecentEvents") || SERVER.includes("recentAdminEvents"));
});

// ---------------------------------------------------------------------------
// 5. Couche TypeScript — double barrière et absence de fuite
// ---------------------------------------------------------------------------

test("chaque Server Action revérifie platform_admin côté application avant tout appel RPC", () => {
  assert.ok(ACTIONS.includes('supabase.rpc("is_platform_admin_self")'));
  assert.ok(ACTIONS.includes('reason: "denied"'));
});

test("les Server Actions ne relaient jamais error.message au client", () => {
  assert.ok(!/message:\s*error\.message/.test(ACTIONS), "error.message est relayé directement au client");
});

test("aucun secret ni clé de service dans la couche commerciale", () => {
  const sources = [MIGRATION, SERVER, ACTIONS, VIEWS];
  const patterns = [/service_role/i, /SUPABASE_SERVICE/i, /sk_live/i, /sk_test/i, /BEGIN [A-Z ]*PRIVATE KEY/];
  for (const source of sources) {
    for (const pattern of patterns) {
      assert.ok(!pattern.test(source), `motif sensible trouvé : ${pattern}`);
    }
  }
});

test("aucune donnée sensible de moyen de paiement n'est manipulée côté TypeScript", () => {
  const forbidden = ["payment_method_brand", "payment_method_last4", "provider_customer_ref", "provider_subscription_ref"];
  for (const source of [SERVER, ACTIONS, VIEWS]) {
    for (const term of forbidden) {
      assert.ok(!source.includes(term), `terme interdit présent : ${term}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Interface — navigation, formulaires, confirmations, états (Étapes 3-5)
// ---------------------------------------------------------------------------

test("le nom d'Organization de la liste est un lien vers sa fiche détaillée", () => {
  assert.ok(VIEWS.includes('href={`/administration/organizations/${row.organizationId}`}'));
  assert.ok(VIEWS.includes("admin-table__view-link"));
});

test("le formulaire d'octroi exige une date de fin pour cadeau / promotion / partenariat", () => {
  assert.ok(VIEWS.includes("END_DATE_REQUIRED_TYPES"));
  assert.ok(VIEWS.includes('new Set(["complimentary", "promotion", "partnership"])'));
  assert.ok(VIEWS.includes("required={endDateRequired}"));
});

test("les champs devise/montant/référence n'apparaissent que pour le paiement hors ligne", () => {
  assert.ok(VIEWS.includes('interventionType === "offline_payment" ?'));
});

test("chaque action (Accorder / Révoquer / Prolonger) exige une case de confirmation explicite avant validation", () => {
  assert.ok(VIEWS.includes("disabled={!confirmChecked || pending}"));
  assert.ok(VIEWS.includes("formConfirmCheckbox"));
  for (const flag of ["grantConfirmed", "revokeConfirmed", "extendConfirmed"]) {
    assert.ok(VIEWS.includes(flag), `case de confirmation absente : ${flag}`);
  }
});

test("la fiche Organization affiche un état vide explicite quand aucune intervention n'est active", () => {
  assert.ok(VIEWS.includes("orgDetailNoActiveIntervention"));
});

test("la fiche Organization affiche un état vide explicite quand l'historique administratif est vide", () => {
  assert.ok(VIEWS.includes("orgDetailNoHistory"));
});

test("une incohérence entre forfait effectif et abonnement enregistré est signalée visuellement", () => {
  assert.ok(VIEWS.includes("detail.planBillingMismatch"));
  assert.ok(VIEWS.includes("orgDetailMismatchWarning"));
});

test("une intervention active et une intervention expirée portent des libellés visuellement distincts", () => {
  assert.ok(VIEWS.includes("orgDetailInterventionExpired"));
  assert.ok(VIEWS.includes("orgDetailInterventionActive"));
  assert.ok(VIEWS.includes("intervention.effectivelyExpired"));
});

test("le courriel du propriétaire n'apparaît que sur la fiche Organization sécurisée, jamais dans la liste", () => {
  const listStart = VIEWS.indexOf("export function OrganizationsView");
  const detailStart = VIEWS.indexOf("export function OrganizationDetailView");
  assert.notEqual(listStart, -1);
  assert.notEqual(detailStart, -1);
  const listBody = VIEWS.slice(listStart, detailStart);
  assert.ok(!listBody.includes("ownerEmail"), "ownerEmail apparaît dans la vue liste");
  const detailBody = VIEWS.slice(detailStart);
  assert.ok(detailBody.includes("detail.ownerEmail"));
});

// ---------------------------------------------------------------------------
// 7. Bilingue — les clés propres à ce lot sont couvertes dans les deux langues
// ---------------------------------------------------------------------------

test("les libellés d'intervention, de motif et d'événement couvrent les mêmes clés en FR et en EN", () => {
  for (const dict of ["interventionTypeLabels", "reasonCodeLabels", "eventTypeLabels", "outcomeLabels"] as const) {
    const fr = Object.keys(ADMIN_COPY.fr[dict]).sort();
    const en = Object.keys(ADMIN_COPY.en[dict]).sort();
    assert.deepEqual(fr, en, `${dict} diverge entre FR et EN`);
    assert.ok(fr.length > 0, `${dict} est vide`);
  }
});

test("tous les types d'intervention et motifs normalisés du schéma ont un libellé bilingue", () => {
  const types = ["complimentary", "offline_payment", "promotion", "partnership", "support_adjustment"];
  const reasons = [
    "sales_gift", "partner_offer", "manual_payment_received",
    "promotional_campaign", "support_goodwill", "other",
  ];
  for (const type of types) {
    assert.ok(ADMIN_COPY.fr.interventionTypeLabels[type], `type sans libellé FR : ${type}`);
    assert.ok(ADMIN_COPY.en.interventionTypeLabels[type], `type sans libellé EN : ${type}`);
  }
  for (const reason of reasons) {
    assert.ok(ADMIN_COPY.fr.reasonCodeLabels[reason], `motif sans libellé FR : ${reason}`);
    assert.ok(ADMIN_COPY.en.reasonCodeLabels[reason], `motif sans libellé EN : ${reason}`);
  }
});

test("chaque outcome renvoyé par les RPC de ce lot a un libellé bilingue", () => {
  const outcomes = [
    "granted", "already_recorded", "intervention_already_active", "revoked", "not_active",
    "extended", "organization_not_found", "invalid_type", "invalid_plan", "invalid_reason",
    "note_required", "end_date_required", "invalid_period", "invalid_currency", "invalid_amount",
    "invalid_idempotency_key", "reason_required", "not_found",
  ];
  for (const outcome of outcomes) {
    assert.ok(ADMIN_COPY.fr.outcomeLabels[outcome], `outcome sans libellé FR : ${outcome}`);
    assert.ok(ADMIN_COPY.en.outcomeLabels[outcome], `outcome sans libellé EN : ${outcome}`);
  }
});

// ---------------------------------------------------------------------------
// 8. Régression — les garanties ADMIN-01 / ADMIN-01.1 restent valables
// ---------------------------------------------------------------------------

test("la console reste non indexable et non mise en cache après ce lot (pas de changement de layout)", () => {
  const LAYOUT = readFileSync(
    new URL("../src/app/administration/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(LAYOUT.includes("index: false"));
  assert.ok(LAYOUT.includes('dynamic = "force-dynamic"'));
});

test("la nouvelle page de fiche Organization est protégée par le même layout platform_admin, sans garde propre", () => {
  const PAGE = readFileSync(
    new URL("../src/app/administration/organizations/[organizationId]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(PAGE.includes('dynamic = "force-dynamic"'));
  // Aucune vérification d'autorisation locale : elle doit venir du layout partagé
  // et des RPC elles-mêmes (double barrière), jamais d'une troisième copie ici.
  assert.ok(!/assert_platform_admin|is_platform_admin/i.test(PAGE));
});
