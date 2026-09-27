import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Complément — Cohérence globale du cycle de vie — Tests
// =============================================================================
// Ce complément REMPLACE (`create or replace`) six fonctions déjà livrées par
// 01B/01C/01H/01I/ADMIN-01.1, dans une migration séparée
// (20260927200000_revenue_complement_01_lifecycle_coherence.sql) — jamais en
// éditant les fichiers déjà livrés, pour garder l'historique de migrations
// intact. Ces tests vérifient les patterns SQL clés (statiquement, en
// complément du pgTAP réellement exécuté :
// rls_revenue_complement_01_lifecycle_coherence.test.sql) et le câblage
// applicatif (server.ts/views.tsx/copy.ts/route.ts).
//
// Tous les fichiers `server-only` sont inspectés en texte source, jamais
// importés comme modules ES — même convention que revenue-01h-admin-lifecycle
// .test.ts et le reste du projet.
// =============================================================================

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const MIGRATION = read("../supabase/migrations/20260927200000_revenue_complement_01_lifecycle_coherence.sql");
const PGTAP = read("../supabase/tests/database/rls_revenue_complement_01_lifecycle_coherence.test.sql");
const ADMIN_SERVER = read("../src/modules/platform-admin/server.ts");
const ADMIN_VIEWS = read("../src/modules/platform-admin/views.tsx");
const ADMIN_COPY = read("../src/modules/platform-admin/copy.ts");
const GLOBALS_CSS = read("../src/app/globals.css");
const SUPPORT_ROUTE = read("../src/app/api/support/route.ts");
const LOAD_ORG_CONTEXT = read("../src/core/organization/load-organization-context.ts");
const CONTACTS_EXPORT_ROUTE = read("../src/app/api/administration/contacts/export/route.ts");

const MIGRATION_CLEAN = sansCommentaires(MIGRATION);

// ---------------------------------------------------------------------------
// 1. Migration — enveloppe et non-application
// ---------------------------------------------------------------------------

test("la migration complément est enveloppée begin;/commit; (convention du projet)", () => {
  assert.match(MIGRATION, /^begin;/);
  assert.match(MIGRATION, /\ncommit;\s*$/);
});

// ---------------------------------------------------------------------------
// 2. §2 — Compteurs : organizations_archived, jamais une Organization perdue
// ---------------------------------------------------------------------------

test("admin_platform_counters expose organizations_archived", () => {
  const start = MIGRATION_CLEAN.indexOf("function public.admin_platform_counters");
  assert.ok(start >= 0, "admin_platform_counters introuvable");
  const body = MIGRATION_CLEAN.slice(start, start + 3000);
  assert.match(body, /'organizations_archived',\s*\(select count\(\*\) from public\.organizations where status = 'archived'\)/);
  assert.match(body, /'organizations_requiring_provider_action'/);
});

test("PlatformCounters (server.ts) porte organizationsArchived et organizationsRequiringProviderAction", () => {
  assert.match(ADMIN_SERVER, /organizationsArchived: number;/);
  assert.match(ADMIN_SERVER, /organizationsRequiringProviderAction: number;/);
  assert.match(ADMIN_SERVER, /organizationsArchived: toNumber\(payload\.organizations_archived\)/);
  assert.match(ADMIN_SERVER, /organizationsRequiringProviderAction: toNumber\(payload\.organizations_requiring_provider_action\)/);
});

test("la vue d'ensemble (views.tsx) affiche le compteur Organizations archivées", () => {
  assert.match(ADMIN_VIEWS, /counters\.organizationsArchived/);
});

// ---------------------------------------------------------------------------
// 3. §3 — Effets financiers : garde de statut, signal provider, historique intact
// ---------------------------------------------------------------------------

test("admin_issue_manual_invoice refuse toute Organization non active avant toute autre validation", () => {
  const start = MIGRATION_CLEAN.indexOf("function public.admin_issue_manual_invoice");
  assert.ok(start >= 0);
  const body = MIGRATION_CLEAN.slice(start, start + 1500);
  const notFoundIdx = body.indexOf("organization_not_found");
  const notActiveIdx = body.indexOf("organization_not_active");
  const idempotencyIdx = body.indexOf("invalid_idempotency_key");
  assert.ok(notFoundIdx >= 0 && notActiveIdx >= 0 && idempotencyIdx >= 0);
  assert.ok(
    notFoundIdx < notActiveIdx && notActiveIdx < idempotencyIdx,
    "la garde de statut doit s'exécuter après l'existence mais avant toute autre validation",
  );
});

test("compute_due_billing_reminders exige organizations.status = 'active' dans chaque branche du UNION ALL", () => {
  const start = MIGRATION_CLEAN.indexOf("function private.compute_due_billing_reminders");
  assert.ok(start >= 0);
  const body = MIGRATION_CLEAN.slice(start, start + 2500);
  const matches = body.match(/o\.status = 'active'/g) ?? [];
  assert.equal(matches.length, 5, "les 5 branches du UNION ALL (renouvellement, grâce, expiration moyen de paiement, facture due, facture en retard) doivent toutes filtrer sur le statut, même celles sans candidat réel aujourd'hui");
});

test("la bascule grace -> billing_blocked (admin_run_billing_reminders) exige aussi une Organization active", () => {
  const start = MIGRATION_CLEAN.indexOf("function public.admin_run_billing_reminders");
  assert.ok(start >= 0);
  const body = MIGRATION_CLEAN.slice(start, start + 3000);
  assert.match(body, /join public\.organizations o on o\.id = s\.organization_id[\s\S]{0,200}o\.status = 'active'/);
});

test("le signal providerActionRequired ne résout jamais rien automatiquement (aucun UPDATE sur organization_subscriptions)", () => {
  const start = MIGRATION_CLEAN.indexOf("function public.admin_get_organization_detail");
  assert.ok(start >= 0);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start + 100));
  assert.match(body, /provider_action_required := org\.status <> 'active'/);
  assert.doesNotMatch(body, /update public\.organization_subscriptions/);
});

test("OrganizationDetail (server.ts) et la fiche Organization (views.tsx) portent providerActionRequired", () => {
  assert.match(ADMIN_SERVER, /providerActionRequired: boolean;/);
  assert.match(ADMIN_SERVER, /providerActionRequired: payload\.providerActionRequired === true/);
  assert.match(ADMIN_VIEWS, /detail\.providerActionRequired/);
});

// ---------------------------------------------------------------------------
// 4. §4 — Contacts et marketing : statut exposé, éligibilité complète
// ---------------------------------------------------------------------------

test("admin_list_commercial_contacts et son export exposent organization_status et marketing_eligible", () => {
  const consoleStart = MIGRATION_CLEAN.indexOf("function public.admin_list_commercial_contacts(");
  const exportStart = MIGRATION_CLEAN.indexOf("function public.admin_list_commercial_contacts_for_export(");
  assert.ok(consoleStart >= 0 && exportStart >= 0);
  const consoleBody = MIGRATION_CLEAN.slice(consoleStart, exportStart);
  const exportBody = MIGRATION_CLEAN.slice(exportStart, exportStart + 2500);
  for (const body of [consoleBody, exportBody]) {
    assert.match(body, /o\.status = 'active'/);
    assert.match(body, /coalesce\(c\.marketing_consent, false\)/);
    assert.match(body, /c\.consent_source is not null/);
    assert.match(body, /c\.unsubscribed_at is null/);
  }
  assert.match(MIGRATION_CLEAN, /drop function if exists public\.admin_list_commercial_contacts_for_export\(\);/);
});

test("AdminCommercialContactRow (server.ts) porte organizationStatus et marketingEligible", () => {
  assert.match(ADMIN_SERVER, /organizationStatus: string;/);
  assert.match(ADMIN_SERVER, /marketingEligible: boolean;/);
  assert.match(ADMIN_SERVER, /organizationStatus: String\(r\.organization_status \?\? ""\)/);
  assert.match(ADMIN_SERVER, /marketingEligible: r\.marketing_eligible === true/);
});

test("la console (views.tsx) et l'export CSV affichent le statut et l'éligibilité marketing", () => {
  assert.match(ADMIN_VIEWS, /row\.organizationStatus/);
  assert.match(ADMIN_VIEWS, /row\.marketingEligible/);
  assert.match(CONTACTS_EXPORT_ROUTE, /organization_status/);
  assert.match(CONTACTS_EXPORT_ROUTE, /marketing_eligible/);
});

// ---------------------------------------------------------------------------
// 5. §5 — Accès : aide/support reste joignable pour une Organization non active
// ---------------------------------------------------------------------------

test("loadAnyMembershipOrganization ne filtre jamais par organizations.status (contrairement à loadOrganizationContext)", () => {
  const start = LOAD_ORG_CONTEXT.indexOf("export async function loadAnyMembershipOrganization");
  assert.ok(start >= 0, "loadAnyMembershipOrganization introuvable");
  const body = LOAD_ORG_CONTEXT.slice(start);
  assert.match(body, /\.from\("organizations"\)\.select\("id, status"\)\.in\("id", ids\)/);
  assert.doesNotMatch(body, /\.eq\("status", "active"\)\.in\("id", ids\)/);
});

test("/api/support résout l'Organization via loadAnyMembershipOrganization, jamais loadOrganizationContext", () => {
  assert.match(SUPPORT_ROUTE, /import \{ loadAnyMembershipOrganization \} from "@\/core\/organization\/load-organization-context";/);
  assert.doesNotMatch(SUPPORT_ROUTE, /loadOrganizationContext\(\)/);
});

// ---------------------------------------------------------------------------
// 6. §6 — Multi-Organizations : plus de suppression directe dans auth.sessions
// ---------------------------------------------------------------------------

test("best_effort_revoke_sessions ne touche plus jamais auth.sessions", () => {
  const start = MIGRATION_CLEAN.indexOf("function private.best_effort_revoke_sessions");
  assert.ok(start >= 0);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start));
  assert.doesNotMatch(body, /auth\.sessions/);
  assert.match(body, /return false;/);
});

// ---------------------------------------------------------------------------
// 7. copy.ts — parité FR/EN des nouvelles clés
// ---------------------------------------------------------------------------

test("les nouvelles clés du complément existent en FR et en EN", () => {
  const NEW_KEYS = [
    "organizationsArchived", "organizationsRequiringProviderAction", "filterStatusArchived",
    "orgDetailProviderActionRequired", "colMarketingEligible", "marketingEligibleYes", "marketingEligibleNo",
  ];
  const frSection = ADMIN_COPY.slice(ADMIN_COPY.indexOf("const fr: AdminCopy = {"), ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  const enSection = ADMIN_COPY.slice(ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  for (const key of NEW_KEYS) {
    assert.ok(frSection.includes(`${key}:`), `clé FR manquante : ${key}`);
    assert.ok(enSection.includes(`${key}:`), `clé EN manquante : ${key}`);
  }
});

test("les badges de statut Organization (active/suspendue/archivée) existent dans globals.css", () => {
  assert.match(GLOBALS_CSS, /\.admin-badge--active\s*\{/);
  assert.match(GLOBALS_CSS, /\.admin-badge--suspended\s*\{/);
  assert.match(GLOBALS_CSS, /\.admin-badge--archived\s*\{/);
});

// ---------------------------------------------------------------------------
// 8. pgTAP — réellement exécuté (PostgreSQL 16 local + pgtap réel)
// ---------------------------------------------------------------------------

test("le fichier pgTAP complément déclare exactement autant d'assertions que son plan()", () => {
  const clean = sansCommentaires(PGTAP);
  const planMatch = clean.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N) introuvable");
  const declared = Number(planMatch![1]);
  const assertions = (clean.match(/^select (is|ok|throws_ok)\(/gm) ?? []).length;
  assert.equal(assertions, declared);
});

test("le fichier pgTAP complément s'exécute dans une transaction annulée (rollback)", () => {
  assert.match(PGTAP, /^begin;/);
  assert.match(PGTAP, /rollback;\s*$/);
});

test("le fichier pgTAP complément couvre les 11 domaines de la matrice d'accès (§5)", () => {
  const DOMAINS = [
    "property.view", "unit.view", "tenant.view", "lease.view", "due.view",
    "payment.view", "receipt.view", "contract.manage", "member.view",
    "data_export.manage", "billing.view",
  ];
  for (const capability of DOMAINS) {
    assert.match(PGTAP, new RegExp(`has_capability\\('d0100000-0000-4000-8000-00000000000b', '${capability.replace(".", "\\.")}'\\)`));
  }
});

test("le fichier pgTAP complément vérifie qu'exactement un propriétaire actif subsiste après transfert", () => {
  assert.match(PGTAP, /role = 'organization_owner' and status = 'active'\),\s*\n\s*1,/);
});

test("le fichier pgTAP complément vérifie qu'une ligne auth.sessions n'est plus jamais supprimée par admin_disable_member", () => {
  assert.match(PGTAP, /exists\(select 1 from auth\.sessions where id = 'd0000000-0000-4000-8000-0000000000aa'\)/);
});
