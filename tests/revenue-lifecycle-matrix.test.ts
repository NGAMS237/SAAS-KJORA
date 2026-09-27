import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  MANUAL_BILLING_MESSAGES,
  MANUAL_BILLING_UNKNOWN_MESSAGE,
  MANUAL_INVOICE_ISSUE_OUTCOMES,
  MANUAL_PAYMENT_CONFIRM_OUTCOMES,
  isValidManualBillingIdempotencyKey,
  manualBillingOutcomeMessage,
} from "../src/core/billing/manual-billing-outcomes.ts";
import {
  BILLING_LEGAL_IDENTITY_ENV,
  legalIdentityLines,
  resolveBillingLegalIdentity,
} from "../src/core/billing/legal-identity.ts";
import { MANUAL_INVOICE_PAYMENT_TERM_DAYS, defaultManualInvoiceDueOn } from "../src/core/billing/model.ts";
import { SUSPENDED_COPY } from "../src/core/organization/suspended-copy.ts";
import { MARKETING_CONSENT_VERSION, isValidConsentEvidence } from "../src/modules/platform-admin/marketing-consent.ts";

// =============================================================================
// REVENUE-LAUNCH-01 v3 — Cohérence du cycle de vie — Tests Node
// =============================================================================
// Complète les pgTAP RÉELLEMENT exécutés (rls_revenue_lifecycle_matrix,
// rls_revenue_billing_integrity) : modules purs testés par exécution, câblage
// applicatif et SQL vérifiés en texte source (fichiers server-only / TSX non
// importables par le test runner Node, même convention que le reste du projet).
// =============================================================================

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const MIGRATIONS_DIR = "../supabase/migrations/";
const M01B = read(`${MIGRATIONS_DIR}20260927150000_revenue_01b_manual_invoicing_africa.sql`);
const M01C = read(`${MIGRATIONS_DIR}20260927160000_revenue_01c_billing_reminders.sql`);
const M01H = read(`${MIGRATIONS_DIR}20260927180000_revenue_01h_admin_lifecycle.sql`);
const M01I = read(`${MIGRATIONS_DIR}20260927190000_revenue_01i_commercial_contacts.sql`);
const REVENUE_MIGRATIONS = [
  "20260927150000_revenue_01b_manual_invoicing_africa.sql",
  "20260927160000_revenue_01c_billing_reminders.sql",
  "20260927170000_revenue_01e_admin_finance_extension.sql",
  "20260927180000_revenue_01h_admin_lifecycle.sql",
  "20260927190000_revenue_01i_commercial_contacts.sql",
].map((f) => ({ file: f, sql: read(`${MIGRATIONS_DIR}${f}`) }));

const PGTAP_MATRIX = read("../supabase/tests/database/rls_revenue_lifecycle_matrix.test.sql");
const PGTAP_BILLING = read("../supabase/tests/database/rls_revenue_billing_integrity.test.sql");
const INVOICE_PDF = read("../src/core/billing/invoice-pdf.ts");
const AUTH_SERVER = read("../src/core/authorization/server.ts");
const RESOLVER = read("../src/core/routing/context-resolver.ts");
const SUSPENDED_PAGE = read("../src/app/organisation-suspendue/page.tsx");
const SUSPENDED_VIEW = read("../src/core/organization/suspended-organization-view.tsx");
const RESTRICTED = read("../src/core/organization/restricted-organizations.ts");
const EXPORT_ROUTE = read("../src/app/api/organisation-suspendue/export/route.ts");
const INVOICE_ROUTE = read("../src/app/api/organisation-suspendue/factures/[invoiceId]/route.ts");
const INTERNAL_LAYOUT = read("../src/app/(internal)/app/layout.tsx");
const PORTAL_LAYOUT = read("../src/app/(portal)/portal/layout.tsx");
const PORTAL_LOGIN = read("../src/app/(portal-auth)/portal/connexion/page.tsx");
const DATA_EXPORT = read("../src/modules/data-export/server.ts");
const MANUAL_ACTIONS = read("../src/modules/platform-admin/manual-invoicing-actions.ts");
const ENV_EXAMPLE = read("../.env.example");

// ---------------------------------------------------------------------------
// 1. Migrations finales — nettoyées, rejouables, jamais de DELETE auth.sessions
// ---------------------------------------------------------------------------

test("exactement 5 migrations Revenue, aucune migration « complément » résiduelle", () => {
  const revenue = readdirSync(new URL(MIGRATIONS_DIR, import.meta.url)).filter((f) => /revenue/i.test(f)).sort();
  assert.deepEqual(revenue, REVENUE_MIGRATIONS.map((m) => m.file));
});

test("aucune migration Revenue finale ne supprime ni n'écrit dans auth.sessions", () => {
  for (const { file, sql } of REVENUE_MIGRATIONS) {
    const clean = sansCommentaires(sql);
    assert.doesNotMatch(clean, /delete\s+from\s+auth\.sessions/i, file);
    assert.doesNotMatch(clean, /(update|insert\s+into)\s+auth\.sessions/i, file);
  }
});

test("nettoyage : aucune fonction n'est définie deux fois dans la série Revenue", () => {
  const counts = new Map<string, number>();
  for (const { sql } of REVENUE_MIGRATIONS) {
    for (const match of sansCommentaires(sql).matchAll(/create (?:or replace )?function ([\w.]+)\(/g)) {
      counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    }
  }
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
  assert.deepEqual(duplicated, []);
});

test("chaque migration Revenue reste enveloppée begin;/commit;", () => {
  for (const { file, sql } of REVENUE_MIGRATIONS) {
    assert.match(sql, /^begin;/, file);
    assert.match(sql, /\ncommit;\s*$/, file);
  }
});

// ---------------------------------------------------------------------------
// 2. Facturation manuelle — cycle NULL, idempotence, due_on, fournisseur, payload
// ---------------------------------------------------------------------------

test("validation NULL-sûre du plan et du cycle à l'émission", () => {
  const body = M01B.slice(M01B.indexOf("create or replace function public.admin_issue_manual_invoice("));
  assert.match(body, /if p_plan is null or p_plan not in/);
  assert.match(body, /if p_cycle is null or p_cycle not in/);
});

test("la confirmation écrit toujours le cycle facturé, jamais un pending_cycle éventuellement NULL", () => {
  const start = M01B.indexOf("create or replace function public.admin_confirm_manual_invoice_payment(");
  const body = sansCommentaires(M01B.slice(start, M01B.indexOf("$$;", start)));
  assert.match(body, /target_cycle := inv\.billing_cycle;/);
  assert.doesNotMatch(body, /target_cycle := sub\.pending_cycle/);
});

test("idempotence réelle : jeton de confirmation conservé et unique, conflit explicite", () => {
  assert.match(M01B, /create unique index if not exists billing_invoices_payment_idempotency_unique\s+on public\.billing_invoices \(payment_idempotency_key\)/);
  const body = M01B.slice(M01B.indexOf("create or replace function public.admin_confirm_manual_invoice_payment("));
  assert.match(body, /payment_idempotency_key = p_idempotency_key/);
  assert.match(body, /'payment_idempotency_conflict'/);
  assert.match(body, /'replayed', inv\.payment_idempotency_key is not distinct from p_idempotency_key/);
  const issue = M01B.slice(M01B.indexOf("create or replace function public.admin_issue_manual_invoice("));
  assert.match(issue, /'issue_idempotency_conflict'/);
});

test("les Server Actions n'inventent plus jamais un jeton d'idempotence à chaque appel", () => {
  assert.doesNotMatch(MANUAL_ACTIONS, /idempotencyKey \|\| randomUUID\(\)/);
  assert.match(MANUAL_ACTIONS, /isValidManualBillingIdempotencyKey\(idempotencyKey\)/);
  assert.equal(isValidManualBillingIdempotencyKey("1234567"), false);
  assert.equal(isValidManualBillingIdempotencyKey("12345678"), true);
  assert.equal(isValidManualBillingIdempotencyKey("x".repeat(201)), false);
  assert.equal(isValidManualBillingIdempotencyKey(undefined), false);
});

test("due_on : colonne, défaut identique SQL/TypeScript, rappels fondés dessus", () => {
  assert.match(M01B, /add column if not exists due_on date/);
  assert.match(M01B, /least\(greatest\(p_period_start, current_date\) \+ 7, p_period_end\)/);
  assert.equal(MANUAL_INVOICE_PAYMENT_TERM_DAYS, 7);
  assert.equal(defaultManualInvoiceDueOn("2026-10-10", "2026-11-10", "2026-09-27"), "2026-10-17");
  assert.equal(defaultManualInvoiceDueOn("2026-09-01", "2026-10-01", "2026-09-27"), "2026-10-01");
  assert.equal(defaultManualInvoiceDueOn("2026-09-20", "2026-12-01", "2026-09-27"), "2026-10-04");
  assert.match(M01C, /coalesce\(i\.due_on, i\.period_end\)/);
});

test("refus explicite des abonnements gérés par un fournisseur (émission et confirmation)", () => {
  const matches = sansCommentaires(M01B).match(/if sub\.provider is not null then\s+return jsonb_build_object\('outcome', 'provider_managed_subscription'\)/g) ?? [];
  assert.equal(matches.length, 2);
});

test("aucune donnée sensible dans billing_events.payload ni dans les colonnes lisibles par l'Organization", () => {
  const confirm = M01B.slice(M01B.indexOf("create or replace function public.admin_confirm_manual_invoice_payment("));
  const eventInsert = confirm.slice(confirm.indexOf("insert into public.billing_events"), confirm.indexOf("return jsonb_build_object(\n    'outcome', 'confirmed'"));
  assert.doesNotMatch(eventInsert, /'note'|'manualReference'/);
  assert.match(M01B, /revoke select on public\.billing_events from authenticated;/);
  assert.match(M01B, /grant select \(\s*id, organization_id, event_type, from_status, to_status, created_at\s*\) on public\.billing_events to authenticated;/);
  const invoiceGrant = M01B.slice(M01B.indexOf("grant select (\n  id, organization_id, number"), M01B.indexOf("on public.billing_invoices to authenticated;"));
  assert.doesNotMatch(invoiceGrant, /manual_payment_note|created_by|manual_payment_confirmed_by|idempotency/);
  assert.match(M01B, /drop function if exists public\.list_billing_invoices\(uuid\);/);
});

// ---------------------------------------------------------------------------
// 3. Identité légale configurable — aucune entité codée en dur
// ---------------------------------------------------------------------------

test("aucune dénomination sociale codée en dur dans la facture PDF", () => {
  assert.doesNotMatch(INVOICE_PDF, /VERALUZ|KAJEMO/i);
  assert.match(INVOICE_PDF, /legalIdentityLines\(input\.issuer, input\.language\)/);
});

test("identité légale lue depuis la configuration, jamais inventée, absence signalée honnêtement", () => {
  assert.equal(resolveBillingLegalIdentity({}), null);
  assert.equal(resolveBillingLegalIdentity({ [BILLING_LEGAL_IDENTITY_ENV.legalName]: "   " }), null);
  const identity = resolveBillingLegalIdentity({
    [BILLING_LEGAL_IDENTITY_ENV.legalName]: "  Entité  Test  ",
    [BILLING_LEGAL_IDENTITY_ENV.taxId]: "T-1",
  });
  assert.deepEqual(identity, {
    legalName: "Entité Test", address: null, registrationNumber: null, taxId: "T-1", contactEmail: null,
  });
  assert.match(legalIdentityLines(null, "fr")[0], /non configuré/);
  assert.match(legalIdentityLines(null, "en")[0], /not configured/);
  for (const name of Object.values(BILLING_LEGAL_IDENTITY_ENV)) {
    assert.match(ENV_EXAMPLE, new RegExp(`^${name}=$`, "m"));
    assert.doesNotMatch(name, /^NEXT_PUBLIC_/);
  }
});

// ---------------------------------------------------------------------------
// 4. Messages FR/EN des résultats de facturation — centralisés, repli sûr
// ---------------------------------------------------------------------------

test("chaque résultat possible des deux RPC a un message FR et EN non vide", () => {
  const REQUIRED = [
    "organization_not_active", "provider_managed_subscription", "currency_not_supported",
    "invalid_idempotency_key", "invalid_plan", "plan_is_free", "plan_requires_quote", "invalid_cycle",
    "invalid_period", "no_catalog_price", "already_issued", "amount_mismatch", "currency_mismatch",
    "already_paid", "payment_idempotency_conflict", "invoice_not_found",
  ];
  for (const outcome of [...REQUIRED, ...MANUAL_INVOICE_ISSUE_OUTCOMES, ...MANUAL_PAYMENT_CONFIRM_OUTCOMES]) {
    const entry = (MANUAL_BILLING_MESSAGES as Record<string, { fr: string; en: string }>)[outcome];
    assert.ok(entry, `message manquant : ${outcome}`);
    assert.ok(entry.fr.trim().length > 0 && entry.en.trim().length > 0, outcome);
  }
});

test("chaque résultat renvoyé par le SQL est couvert par le mapping (aucun oubli)", () => {
  const issue = M01B.slice(M01B.indexOf("create or replace function public.admin_issue_manual_invoice("), M01B.indexOf("create or replace function public.admin_confirm_manual_invoice_payment("));
  const confirm = M01B.slice(M01B.indexOf("create or replace function public.admin_confirm_manual_invoice_payment("));
  for (const [body, list] of [[issue, MANUAL_INVOICE_ISSUE_OUTCOMES], [confirm, MANUAL_PAYMENT_CONFIRM_OUTCOMES]] as const) {
    const outcomes = new Set([...body.matchAll(/'outcome', '([a-z_]+)'/g)].map((m) => m[1]));
    for (const outcome of outcomes) assert.ok((list as readonly string[]).includes(outcome), `non mappé : ${outcome}`);
  }
});

test("un résultat inconnu retombe sur un message générique sûr, jamais le code brut", () => {
  const unknown = manualBillingOutcomeMessage("some_future_code", "fr");
  assert.equal(unknown.known, false);
  assert.equal(unknown.text, MANUAL_BILLING_UNKNOWN_MESSAGE.fr);
  assert.doesNotMatch(unknown.text, /some_future_code/);
  assert.equal(manualBillingOutcomeMessage(undefined, "en").text, MANUAL_BILLING_UNKNOWN_MESSAGE.en);
  assert.equal(manualBillingOutcomeMessage("__proto__", "fr").known, false);
  const known = manualBillingOutcomeMessage("amount_mismatch", "en");
  assert.equal(known.known, true);
  assert.equal(known.tone, "error");
});

// ---------------------------------------------------------------------------
// 5. Politique suspendue/archivée — exceptions étroites, has_capability strict
// ---------------------------------------------------------------------------

test("has_capability reste strict ; les exceptions vivent dans une liste fermée dédiée", () => {
  const hc = M01H.slice(M01H.indexOf("create or replace function private.has_capability("));
  assert.match(hc.slice(0, hc.indexOf("$$;")), /and o\.status = 'active'/);
  const restricted = M01B.slice(M01B.indexOf("create or replace function private.has_restricted_capability("));
  const body = restricted.slice(0, restricted.indexOf("$$;"));
  assert.match(body, /requested_capability in \('billing\.view', 'data_export\.manage'\)/);
  assert.match(body, /and o\.status = 'suspended'/);
  assert.match(body, /requested_capability <> 'data_export\.manage' or m\.role = 'organization_owner'/);
});

test("isOrganizationActive est fail-closed", () => {
  const body = AUTH_SERVER.slice(AUTH_SERVER.indexOf("export async function isOrganizationActive"));
  const fn = body.slice(0, body.indexOf("\n}"));
  assert.match(fn, /if \(error \|\| !data\) return false;/);
});

test("contexte limité : route dédiée, jamais l'onboarding ni une application vide", () => {
  assert.match(RESOLVER, /export const ROUTE_SUSPENDED = "\/organisation-suspendue";/);
  assert.match(RESOLVER, /return \{ kind: "organization_suspended", hasPortalIdentity \};/);
  assert.match(SUSPENDED_PAGE, /resolveMyRestrictedOrganization\(requested \?\? null\)/);
  assert.match(SUSPENDED_PAGE, /selected\.status === "suspended" && selected\.canViewBilling/);
  assert.match(RESTRICTED, /rpc\("list_my_restricted_organizations"\)/);
});

test("l'écran propose support, facturation et export du propriétaire, et n'affiche jamais de motif interne", () => {
  assert.match(SUSPENDED_VIEW, /<SupportForm contactEmail=\{contactEmail\} organizationId=\{selected\.id\} \/>/);
  assert.match(SUSPENDED_VIEW, /suspended && selected\.canViewBilling/);
  assert.match(SUSPENDED_VIEW, /selected\.canExport \?/);
  for (const source of [SUSPENDED_VIEW, SUSPENDED_PAGE, RESTRICTED]) {
    assert.doesNotMatch(sansCommentaires(source), /status_reason|statusReason|admin_note|adminNote/);
  }
});

test("multi-Organizations : l'Organization active reste sélectionnée, la suspendue est signalée à part", () => {
  assert.match(INTERNAL_LAYOUT, /<RestrictedOrganizationsBanner organizations=\{restrictedOrganizations\} \/>/);
});

test("export suspendu : Owner uniquement (droit calculé en base), CSV/XLSX, source dédiée", () => {
  assert.match(EXPORT_ROUTE, /selected\.status !== "suspended" \|\| !selected\.canExport/);
  assert.match(EXPORT_ROUTE, /"restricted_owner"/);
  assert.doesNotMatch(EXPORT_ROUTE, /"zip"/);
  assert.match(DATA_EXPORT, /rpc\("export_restricted_owner_source"/);
  assert.match(DATA_EXPORT, /scope_unavailable_while_suspended/);
  assert.doesNotMatch(DATA_EXPORT, /service_role|SUPABASE_SECRET_KEY/);
});

test("facture d'une Organization suspendue : jamais pour une archivée", () => {
  assert.match(INVOICE_ROUTE, /selected\.status !== "suspended" \|\| !selected\.canViewBilling/);
});

test("portail locataire : message d'indisponibilité dédié, jamais confondu avec un accès révoqué", () => {
  assert.match(PORTAL_LAYOUT, /reason=organization-unavailable/);
  assert.match(PORTAL_LOGIN, /organization-unavailable/);
});

test("les textes du contexte limité existent en FR et en EN, sans motif interne", () => {
  const fr = SUSPENDED_COPY.fr;
  const en = SUSPENDED_COPY.en;
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  assert.match(fr.titleSuspended("Org"), /suspendue/);
  assert.match(en.titleArchived("Org"), /archived/);
  assert.doesNotMatch(JSON.stringify(fr) + JSON.stringify(en), /motif|reason/i);
});

// ---------------------------------------------------------------------------
// 6. Consentement marketing versionné — même version côté TS et SQL
// ---------------------------------------------------------------------------

test("version du texte de consentement identique TypeScript/SQL, preuve bornée", () => {
  assert.equal(MARKETING_CONSENT_VERSION, "kjora-marketing-v1");
  assert.match(M01I, new RegExp(`consent_version in \\('${MARKETING_CONSENT_VERSION}'\\)`));
  assert.equal(isValidConsentEvidence("  ab "), false);
  assert.equal(isValidConsentEvidence("Accord oral"), true);
  assert.equal(isValidConsentEvidence("x".repeat(501)), false);
});

test("éligibilité marketing : formule unique partagée par la console et l'export", () => {
  const uses = M01I.match(/private\.is_marketing_eligible\(o\.status, c\.marketing_consent, c\.consent_source,\s*c\.consent_version, c\.consent_event_id, c\.unsubscribed_at\)/g) ?? [];
  assert.equal(uses.length, 2);
});

// ---------------------------------------------------------------------------
// 7. pgTAP — réellement exécutés (PostgreSQL 16 local + pgtap réel)
// ---------------------------------------------------------------------------

for (const [name, source] of [["matrice du cycle de vie", PGTAP_MATRIX], ["intégrité de facturation", PGTAP_BILLING]] as const) {
  test(`pgTAP ${name} : plan() égal au nombre réel d'assertions, transaction annulée`, () => {
    const clean = sansCommentaires(source);
    const declared = Number(clean.match(/select plan\((\d+)\);/)?.[1]);
    const assertions = (clean.match(/^select (is|ok|throws_ok)\(/gm) ?? []).length;
    assert.equal(assertions, declared);
    assert.match(source, /^begin;/);
    assert.match(source, /rollback;\s*$/);
  });
}

test("la matrice pgTAP couvre Owner, collaborateur, archivée, locataire et multi-Organizations", () => {
  for (const label of [
    "Owner d''une Organization suspendue : export autorisé",
    "collaborateur d''une Organization suspendue : aucun export",
    "Organization archivée : aucun export self-service",
    "locataire : le portail d''une Organization suspendue est fermé",
    "multi-Organizations : l''Organization active du même Owner reste pleinement accessible",
    "le ZIP (matérialisation de PDF) est refusé",
  ]) {
    assert.ok(PGTAP_MATRIX.includes(label), `scénario manquant : ${label}`);
  }
});
