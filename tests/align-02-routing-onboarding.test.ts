// =============================================================================
// Node tests — ALIGN-02 : Auth, context resolver, routing, onboarding, quotas
// Couvre les 22 scénarios obligatoires de la spécification §17.
// =============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parsePlanRequested,
  isSurMesure,
  needsIntentPreservation,
  planLabel,
  buildConnexionUrl,
  parseSiteAppIntent,
  appendSiteAppIntent,
  destinationAfterOnboarding,
  type SiteAppIntent,
  SUR_MESURE_CONTACT_URL,
} from "../src/core/onboarding/plan-intent.ts";
import {
  ONBOARDING_STEPS,
  onboardingStepRank,
  advanceStep,
  parseOnboardingState,
  emptyOnboardingState,
  nextOnboardingDestination,
  isOnboardingComplete,
  isRentCollectionMethod,
  RENT_COLLECTION_METHODS,
  type OnboardingState,
} from "../src/core/onboarding/onboarding-state.ts";
import { PLAN_SLUGS, PLAN_QUOTA_TABLE } from "../src/core/entitlements/model.ts";
import { ANALYTICS_EVENTS } from "../src/core/analytics/events.ts";
import { safeNextPath } from "../src/core/auth/safe-next-path.ts";

const migration02 = readFileSync(
  new URL("../supabase/migrations/20260904120000_align_02_onboarding_and_org_quota.sql", import.meta.url),
  "utf8",
);
const migration01 = readFileSync(
  new URL("../supabase/migrations/20260902200000_align_01_plans_entitlements.sql", import.meta.url),
  "utf8",
);
const resolverSource = readFileSync(
  new URL("../src/core/routing/context-resolver.ts", import.meta.url),
  "utf8",
);
const onboardingApiSource = readFileSync(
  new URL("../src/app/api/onboarding/route.ts", import.meta.url),
  "utf8",
);

function stateWith(overrides: Partial<OnboardingState>): OnboardingState {
  return { ...emptyOnboardingState(), ...overrides };
}

// ---------------------------------------------------------------------------
// 1–4. plan_requested : valide, invalide, decouverte, avance
// ---------------------------------------------------------------------------

test("§17.2 plan_requested=decouverte est reconnu", () => {
  assert.equal(parsePlanRequested("decouverte"), "decouverte");
  assert.equal(needsIntentPreservation("decouverte"), false);
});

test("§17.3 plan_requested=avance est reconnu et conservé comme intention", () => {
  assert.equal(parsePlanRequested("avance"), "avance");
  assert.equal(needsIntentPreservation("avance"), true);
  assert.equal(planLabel("avance"), "Avancé");
});

test("§17.4 plan invalide : fallback silencieux, aucune erreur, aucun droit", () => {
  for (const bad of ["premium", "free", "gold", "plan_premium", "1234", "'; DROP TABLE plans;--", "{}"]) {
    assert.equal(parsePlanRequested(bad), null, `${bad} doit être rejeté`);
  }
  // Un plan null ne déclenche ni sur_mesure ni préservation d'intention
  assert.equal(isSurMesure(null), false);
  assert.equal(needsIntentPreservation(null), false);
});

test("tous les slugs canoniques sont acceptés et aucun autre", () => {
  for (const slug of PLAN_SLUGS) {
    assert.equal(parsePlanRequested(slug), slug);
  }
  assert.equal(PLAN_SLUGS.length, 5);
});

// ---------------------------------------------------------------------------
// 5. sur_mesure → contact commercial, aucune activation
// ---------------------------------------------------------------------------

test("sur_mesure route vers le contact commercial et n'active aucun plan", () => {
  assert.equal(isSurMesure("sur_mesure"), true);
  assert.equal(needsIntentPreservation("sur_mesure"), false, "sur_mesure ne préserve pas d'intention self-serve");
  assert.ok(SUR_MESURE_CONTACT_URL.startsWith("https://"));
  assert.ok(new URL(SUR_MESURE_CONTACT_URL).hostname.length > 0);
});

test("SITE-APP-FLOW-01 valide plan, cycle, locale et source côté serveur", () => {
  assert.deepEqual(parseSiteAppIntent({
    plan: "avance", billing_cycle: "annual", billing_country: "CA", locale: "en", source: "site",
  }), { plan: "avance", billingCycle: "annual", billingCountry: "CA", locale: "en", source: "site" });
  assert.deepEqual(parseSiteAppIntent({
    plan: "avance", plan_requested: "patrimoine", billing_cycle: "weekly", billing_country: "US", locale: "xx", source: "utm_campaign",
  }), { plan: "avance", billingCycle: null, billingCountry: null, locale: "fr", source: null });
  assert.equal(parseSiteAppIntent({ plan: "sur_mesure" }).plan, "sur_mesure");
});

// ---------------------------------------------------------------------------
// 6–7. URL manipulée / return_to externe refusé
// ---------------------------------------------------------------------------

test("§17.17 return_to externe est refusé (aucune open redirect)", () => {
  for (const hostile of [
    "https://evil.com",
    "http://evil.com/steal",
    "//evil.com",
    "//evil.com/path",
    "\\\\evil.com",
    "/\\evil.com",
  ]) {
    const result = safeNextPath(hostile);
    assert.ok(
      result === "/app" || result.startsWith("/"),
      `${hostile} ne doit jamais produire une destination externe (obtenu: ${result})`,
    );
    assert.ok(!result.startsWith("//"), `${hostile} produit une redirection protocol-relative`);
    assert.ok(!result.includes("evil.com") || result === "/app", `${hostile} fuit vers evil.com`);
  }
});

test("§17.16 URL manipulée : chemin interne légitime conservé, reste neutralisé", () => {
  assert.equal(
    safeNextPath("/onboarding/organization?plan_requested=avance"),
    "/onboarding/organization?plan_requested=avance",
  );
  assert.equal(safeNextPath(null), "/app");
  assert.equal(safeNextPath(""), "/app");
});

test("buildConnexionUrl produit un next interne cohérent avec la route réelle", () => {
  const intent: SiteAppIntent = { plan: "essentiel", billingCycle: "annual", billingCountry: "CA", locale: "en", source: "site" };
  const url = buildConnexionUrl(intent);
  assert.match(url, /^\/connexion\?plan=essentiel&billing_cycle=annual&billing_country=CA&locale=en&source=site&next=/);
  const next = new URLSearchParams(url.split("?")[1]).get("next");
  assert.equal(next, "/onboarding/organization?plan=essentiel&billing_cycle=annual&billing_country=CA&locale=en&source=site");
  assert.equal(safeNextPath(next), next, "le next généré doit survivre à safeNextPath");
  assert.equal(buildConnexionUrl({ plan: null, billingCycle: null, billingCountry: null, locale: "fr", source: null }), "/connexion?locale=fr&next=%2Fapp");
  assert.equal(appendSiteAppIntent("/app/billing", intent), "/app/billing?plan=essentiel&billing_cycle=annual&billing_country=CA&locale=en&source=site");
  assert.equal(destinationAfterOnboarding({ ...intent, plan: "decouverte" }), "/app");
});

// ---------------------------------------------------------------------------
// 8. plan URL n'accorde aucun entitlement / paid intent ≠ plan payant
// ---------------------------------------------------------------------------

test("§17.19 un plan dans l'URL n'accorde aucun entitlement (RPC ignore la valeur)", () => {
  // Le RPC ne lit jamais plan_intent pour attribuer un plan : seul le trigger le fait
  assert.match(migration02, /plan_intent/);
  assert.doesNotMatch(
    migration02,
    /insert into public\.organization_plans[\s\S]{0,400}p_plan_intent/,
    "plan_intent ne doit jamais alimenter organization_plans",
  );
  assert.match(
    migration02,
    /auto_assign_decouverte/,
    "le plan effectif vient exclusivement du trigger ALIGN-01",
  );
});

test("§17.20 une intention payante ne donne pas le plan payant", () => {
  // La migration ne contient aucune activation de plan payant
  for (const paid of ["'essentiel'", "'avance'", "'patrimoine'"]) {
    assert.doesNotMatch(
      migration02,
      new RegExp(`insert into public\\.organization_plans[\\s\\S]{0,200}${paid}`),
      `aucun plan ${paid} ne doit être activé par ALIGN-02`,
    );
  }
  // Côté TS, une intention payante reste une intention
  assert.equal(needsIntentPreservation("patrimoine"), true);
});

test("§17.21 Découverte obtient le plan et les quotas corrects", () => {
  assert.deepEqual(PLAN_QUOTA_TABLE.decouverte, {
    maxProperties: 1,
    maxActiveUnits: 3,
    maxCollaborators: 0,
    maxOrganizations: 1,
  });
  assert.equal(PLAN_QUOTA_TABLE.essentiel.maxOrganizations, 1);
  assert.equal(PLAN_QUOTA_TABLE.avance.maxOrganizations, 2);
  assert.equal(PLAN_QUOTA_TABLE.patrimoine.maxOrganizations, 5);
});

// ---------------------------------------------------------------------------
// 9. Quota Organization dépassé
// ---------------------------------------------------------------------------

test("§17.15 quota Organization enforced avant tout INSERT", () => {
  const quotaPos = migration02.indexOf("private.assert_organization_quota");
  const insertPos = migration02.indexOf("insert into public.organizations");
  assert.ok(quotaPos > -1, "assert_organization_quota doit être appelée");
  assert.ok(insertPos > -1);
  assert.ok(quotaPos < insertPos, "le contrôle de quota doit précéder l'INSERT");
});

test("PLAN_ORGANIZATION_LIMIT_REACHED existe et aucune Organization n'est supprimée", () => {
  assert.match(migration01, /PLAN_ORGANIZATION_LIMIT_REACHED/);
  assert.doesNotMatch(migration02, /drop table public\.organizations/i);
  assert.doesNotMatch(migration02, /delete from public\.organizations/i);
});

// ---------------------------------------------------------------------------
// 10–14. Context resolver : contextes et priorités
// ---------------------------------------------------------------------------

test("§17.11-12 les invitations priment sur la création d'Organization", () => {
  const membershipPos = resolverSource.indexOf("membership_invitation_pending");
  const portalPos = resolverSource.indexOf("portal_invitation_pending");
  const noOrgPos = resolverSource.indexOf('kind: "no_organization"');
  assert.ok(membershipPos > -1 && portalPos > -1 && noOrgPos > -1);
  // Dans resolveUserContext, les invitations sont testées avant no_organization
  const resolverBody = resolverSource.slice(resolverSource.indexOf("export async function resolveUserContext"));
  const invitationCheck = resolverBody.indexOf("MEMBERSHIP_INVITATION_COOKIE");
  const orgCheck = resolverBody.indexOf("no_organization");
  assert.ok(invitationCheck < orgCheck, "les invitations doivent être évaluées avant la création d'Organization");
});

test("§17.6-10 tous les contextes obligatoires sont modélisés", () => {
  for (const kind of [
    "unauthenticated",
    "membership_invitation_pending",
    "portal_invitation_pending",
    "no_organization",
    "onboarding_incomplete",
    "owner_single_org",
    "owner_multi_org",
    "collaborator",
    "tenant_only",
    "owner_and_tenant",
    "organization_suspended",
  ]) {
    assert.ok(resolverSource.includes(`"${kind}"`), `contexte manquant : ${kind}`);
  }
});

test("le resolver n'accepte aucun paramètre d'URL pour décider du contexte", () => {
  const resolverBody = resolverSource.slice(resolverSource.indexOf("export async function resolveUserContext"));
  assert.doesNotMatch(resolverBody, /searchParams/, "aucun searchParams dans le resolver");
  assert.doesNotMatch(resolverBody, /nextUrl/, "aucun nextUrl dans le resolver");
  // Le rôle vient exclusivement de la table memberships
  assert.match(resolverBody, /from\("memberships"\)/);
});

test("le contexte est résolu côté serveur uniquement", () => {
  assert.match(resolverSource, /^import "server-only";/m);
});

// ---------------------------------------------------------------------------
// 15–17. Onboarding : étapes, reprise, idempotence
// ---------------------------------------------------------------------------

test("les étapes d'onboarding suivent l'ordre canonique", () => {
  assert.deepEqual([...ONBOARDING_STEPS], [
    "plan_intent", "organization", "rent_method", "property", "unit", "completed",
  ]);
  assert.equal(onboardingStepRank("plan_intent"), 0);
  assert.equal(onboardingStepRank("completed"), 5);
});

test("§17.13 une étape ne recule jamais (miroir du SQL)", () => {
  assert.equal(advanceStep("property", "organization"), "property", "pas de retour arrière");
  assert.equal(advanceStep("organization", "property"), "property", "avance autorisée");
  assert.equal(advanceStep("completed", "plan_intent"), "completed");
  assert.equal(advanceStep("plan_intent", "plan_intent"), "plan_intent");
  // Le SQL applique la même règle
  assert.match(migration02, /onboarding_step_rank\(excluded\.step\)\s*>\s*private\.onboarding_step_rank\(os\.step\)/);
});

test("§17.13 l'onboarding est reprenable : chaque étape a une destination", () => {
  assert.equal(nextOnboardingDestination(stateWith({ step: "plan_intent" })), "/onboarding/organization");
  assert.equal(nextOnboardingDestination(stateWith({ step: "organization" })), "/onboarding/organization");
  assert.equal(nextOnboardingDestination(stateWith({ step: "property" })), "/onboarding/bien");
  assert.equal(nextOnboardingDestination(stateWith({ step: "unit" })), "/onboarding/logement");
  assert.equal(nextOnboardingDestination(stateWith({ step: "completed" })), "/app");
});

test("§17.14 double submit : une ressource déjà créée n'est jamais écrasée", () => {
  // coalesce(os.X, excluded.X) garantit que la valeur existante gagne
  for (const column of ["organization_id", "first_property_id", "first_unit_id"]) {
    assert.match(
      migration02,
      new RegExp(`${column}\\s*=\\s*coalesce\\(os\\.${column}, excluded\\.${column}\\)`),
      `${column} doit être protégé contre l'écrasement`,
    );
  }
});

test("l'état d'onboarding se parse sans exception, même corrompu", () => {
  assert.deepEqual(parseOnboardingState(null), emptyOnboardingState());
  assert.deepEqual(parseOnboardingState("garbage"), emptyOnboardingState());
  const parsed = parseOnboardingState({
    exists: true, step: "not_a_step", plan_intent: "hacker_plan",
    rent_collection_method: "bitcoin", organization_id: 42,
  });
  assert.equal(parsed.step, "plan_intent", "étape invalide → fallback sûr");
  assert.equal(parsed.planIntent, null, "plan invalide → null");
  assert.equal(parsed.rentCollectionMethod, null, "méthode invalide → null");
  assert.equal(parsed.organizationId, null, "id non-string → null");
});

test("isOnboardingComplete ne dépend que de l'étape serveur", () => {
  assert.equal(isOnboardingComplete(stateWith({ step: "completed" })), true);
  assert.equal(isOnboardingComplete(stateWith({ step: "unit" })), false);
});

// ---------------------------------------------------------------------------
// 18. Question réception des loyers
// ---------------------------------------------------------------------------

test("§13 les six moyens d'encaissement sont définis et validés", () => {
  assert.deepEqual([...RENT_COLLECTION_METHODS], [
    "mtn_momo", "orange_money", "merchant_account", "bank_transfer", "cash", "multiple",
  ]);
  assert.equal(isRentCollectionMethod("mtn_momo"), true);
  assert.equal(isRentCollectionMethod("bitcoin"), false);
  assert.equal(isRentCollectionMethod(null), false);
  // La colonne SQL applique la même contrainte
  assert.match(migration02, /rent_collection_method text/);
  assert.match(migration02, /'mtn_momo', 'orange_money', 'merchant_account', 'bank_transfer', 'cash', 'multiple'/);
});

// ---------------------------------------------------------------------------
// 19–20. Sécurité : RLS, isolation, secrets
// ---------------------------------------------------------------------------

test("§17.22 onboarding_states est isolé par User (RLS + aucun write direct)", () => {
  assert.match(migration02, /alter table public\.onboarding_states enable row level security/);
  assert.match(migration02, /using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(migration02, /revoke all on public\.onboarding_states from anon, authenticated/);
  // Aucune policy d'écriture directe : tout passe par le RPC SECURITY DEFINER
  assert.doesNotMatch(migration02, /create policy onboarding_states_insert/);
  assert.doesNotMatch(migration02, /create policy onboarding_states_update/);
});

test("tous les RPC ALIGN-02 utilisent search_path vide et retirent anon", () => {
  const definerCount = (migration02.match(/security definer/g) ?? []).length;
  const searchPathCount = (migration02.match(/set search_path = ''/g) ?? []).length;
  assert.ok(definerCount >= 3, "au moins 3 fonctions SECURITY DEFINER");
  assert.ok(searchPathCount >= definerCount, "chaque fonction doit fixer search_path");
  assert.match(migration02, /revoke all on function public\.get_onboarding_state\(\) from public, anon/);
  assert.match(migration02, /revoke all on function public\.upsert_onboarding_state[\s\S]{0,80}from public, anon/);
});

test("le RPC vérifie que l'Organization appartient bien au User", () => {
  assert.match(migration02, /organization_not_owned/);
  assert.match(migration02, /from public\.memberships[\s\S]{0,200}status = 'active'/);
});

// ---------------------------------------------------------------------------
// 21. Analytics sans données sensibles
// ---------------------------------------------------------------------------

test("§16 les 10 événements analytics canoniques sont définis", () => {
  const required = [
    "site_cta_clicked", "auth_started", "magic_link_sent", "auth_completed",
    "plan_intent_received", "onboarding_started", "organization_created",
    "first_property_created", "first_unit_created", "onboarding_completed",
  ];
  for (const event of required) {
    assert.ok((ANALYTICS_EVENTS as readonly string[]).includes(event), `événement manquant : ${event}`);
  }
  assert.equal(ANALYTICS_EVENTS.length, 10);
});

test("§16 aucun token, code ni secret n'est loggable par le typage analytics", () => {
  const analyticsSource = readFileSync(
    new URL("../src/core/analytics/events.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of ["token", "verifier", "secret", "access_token", "code:"]) {
    assert.ok(
      !new RegExp(`\\b${forbidden}\\s*:`, "i").test(analyticsSource),
      `le payload analytics ne doit jamais contenir un champ ${forbidden}`,
    );
  }
  // Aucun identifiant interne dans les payloads
  assert.doesNotMatch(analyticsSource, /user_id\s*:/);
  assert.doesNotMatch(analyticsSource, /organization_id\s*:/);
  assert.doesNotMatch(analyticsSource, /email\s*:/);
});

// ---------------------------------------------------------------------------
// 22. API onboarding : normalisation défensive
// ---------------------------------------------------------------------------

test("l'API onboarding normalise toute entrée client avant le RPC", () => {
  assert.match(onboardingApiSource, /isPlanSlug/);
  assert.match(onboardingApiSource, /isRentCollectionMethod/);
  assert.match(onboardingApiSource, /isOnboardingStep/);
  assert.match(onboardingApiSource, /sameOrigin/, "protection CSRF same-origin");
  assert.match(onboardingApiSource, /unauthenticated/);
});
