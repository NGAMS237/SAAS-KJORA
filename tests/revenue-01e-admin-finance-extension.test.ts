import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01E — Tests
// =============================================================================
// Audit préalable (voir session) : la page Admin Finances (FINANCE-ADMIN-01,
// 20260927090000) existait déjà et couvrait déjà : compteurs commerciaux,
// revenu attendu/encaissé par devise (jamais fusionné), filtre de période,
// état des connecteurs Stripe/Mobile Money (NON CONNECTÉ). Manques réellement
// prouvés par audit, comblés ici SANS toucher à FINANCE-ADMIN-01 :
//   • factures dues / en retard (REVENUE-01B, billing_invoices) — absent
//   • paiements manuels confirmés (REVENUE-01B) — absent (distinct de
//     "paiements hors ligne enregistrés", qui reste commercial_interventions)
//   • rappels envoyés / à envoyer (REVENUE-01C, billing_reminder_log) — absent
//   • échecs de paiement (ALIGN-03, billing_payment_attempts) — absent
//   • liens vers l'Organization dans le tableau d'événements — absent
//     (organizationName affiché en texte brut, jamais en lien)
// =============================================================================

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
function sansCommentaires(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const EXTENSION_MIGRATION = read("../supabase/migrations/20260927170000_revenue_01e_admin_finance_extension.sql");
const FINANCE_ADMIN_01_MIGRATION = read("../supabase/migrations/20260927090000_finance_admin_01_read_model.sql");
const PGTAP = read("../supabase/tests/database/rls_revenue_01e_admin_finance_extension.test.sql");
const SERVER = read("../src/modules/platform-admin/server.ts");
const VIEWS = read("../src/modules/platform-admin/views.tsx");
const PAGE = read("../src/app/administration/finances/page.tsx");
const COPY = read("../src/modules/platform-admin/copy.ts");

// Corps de la seule fonction NOUVELLE de ce lot (hors remplacement ciblé de
// admin_finance_summary, section 0 — voir le test dédié ci-dessous).
const EXTENSION_BODY = EXTENSION_MIGRATION.slice(
  EXTENSION_MIGRATION.indexOf("create or replace function public.admin_finance_billing_extension("),
);

// ---------------------------------------------------------------------------
// 1. FINANCE-ADMIN-01 n'est ni modifié ni remplacé
// ---------------------------------------------------------------------------

test("FINANCE-ADMIN-01 : seul le revenu attendu change (Organizations archivées exclues, comptées à part) — v3", () => {
  // Décision REVENUE-LAUNCH-01 : une Organization archivée n'est jamais un
  // revenu futur normal. admin_finance_summary est remplacée UNE fois, ici ;
  // admin_finance_recent_events n'est jamais touchée.
  assert.doesNotMatch(EXTENSION_MIGRATION, /create or replace function public\.admin_finance_recent_events/);
  const start = EXTENSION_MIGRATION.indexOf("create or replace function public.admin_finance_summary(");
  assert.ok(start >= 0);
  const body = EXTENSION_MIGRATION.slice(start, EXTENSION_MIGRATION.indexOf("create or replace function public.admin_finance_billing_extension("));
  assert.match(body, /and o\.status <> 'archived'/);
  assert.match(body, /'excluded_archived_subscriptions', archived_excluded_count/);
  // Le fichier FINANCE-ADMIN-01 original reste inchangé (historique immuable).
  assert.match(FINANCE_ADMIN_01_MIGRATION, /create or replace function public\.admin_finance_summary/);
  assert.doesNotMatch(FINANCE_ADMIN_01_MIGRATION, /archived/);
});

test("la nouvelle RPC est bien admin_finance_billing_extension, une fonction distincte", () => {
  assert.match(EXTENSION_MIGRATION, /create or replace function public\.admin_finance_billing_extension\(/);
});

// ---------------------------------------------------------------------------
// 2. Sécurité — même gabarit que toutes les RPC admin de ce mandat
// ---------------------------------------------------------------------------

test("admin_finance_billing_extension vérifie l'autorisation plateforme et fige son search_path", () => {
  const start = EXTENSION_MIGRATION.indexOf("function public.admin_finance_billing_extension");
  const end = EXTENSION_MIGRATION.indexOf("$$;", start);
  const body = EXTENSION_MIGRATION.slice(start, end);
  assert.ok(body.includes("private.assert_platform_admin();"));
  assert.ok(body.includes("set search_path = ''"));
  assert.ok(body.includes("security definer"));
});

test("admin_finance_billing_extension est révoquée pour public/anon et accordée seulement à authenticated", () => {
  assert.match(EXTENSION_MIGRATION, /revoke all on function public\.admin_finance_billing_extension\(text\) from public, anon;/);
  assert.match(EXTENSION_MIGRATION, /grant execute on function public\.admin_finance_billing_extension\(text\) to authenticated;/);
});

// ---------------------------------------------------------------------------
// 3. Séparation des domaines — jamais confondu avec commercial_interventions
// ---------------------------------------------------------------------------

test("les paiements manuels confirmés (REVENUE-01B) restent un domaine distinct de commercial_interventions", () => {
  assert.doesNotMatch(sansCommentaires(EXTENSION_BODY), /commercial_interventions/);
  assert.match(EXTENSION_BODY, /manual_payment_confirmed_at is not null/);
});

test("aucune somme CAD+XAF : les agrégats monétaires restent groupés par devise (jsonb_object_agg)", () => {
  assert.match(EXTENSION_MIGRATION, /jsonb_object_agg\(currency, total\)/);
  assert.match(EXTENSION_MIGRATION, /jsonb_object_agg\(currency, total_minor\)/);
});

test("factures dues et en retard sont un état courant, jamais borné par la période choisie", () => {
  const dueBlock = EXTENSION_MIGRATION.slice(
    EXTENSION_MIGRATION.indexOf("into invoices_due_by_currency") - 400,
    EXTENSION_MIGRATION.indexOf("into invoices_due_by_currency"),
  );
  const overdueBlock = EXTENSION_MIGRATION.slice(
    EXTENSION_MIGRATION.indexOf("into invoices_overdue_by_currency") - 400,
    EXTENSION_MIGRATION.indexOf("into invoices_overdue_by_currency"),
  );
  assert.doesNotMatch(dueBlock, /bounds\.period_start/);
  assert.doesNotMatch(overdueBlock, /bounds\.period_start/);
});

test("aucun nom de fournisseur de paiement n'apparaît dans la nouvelle RPC 01E", () => {
  // admin_finance_summary (section 0) reproduit à l'identique ses clés
  // FINANCE-ADMIN-01 préexistantes (connecteurs « non connectés ») ; la
  // fonction nouvelle de ce lot, elle, n'en mentionne aucun.
  assert.doesNotMatch(sansCommentaires(EXTENSION_BODY), /\bstripe\b|\bflutterwave\b|\bcampay\b|\belyonpay\b|\bnotchpay\b|\bpayunit\b/i);
});

test("les factures ouvertes d'Organizations archivées sortent des encours et sont comptées à part (v3)", () => {
  assert.match(EXTENSION_BODY, /where i\.status = 'open' and o\.status <> 'archived'/);
  assert.match(EXTENSION_BODY, /where i\.status = 'open' and o\.status = 'archived'/);
  assert.match(EXTENSION_BODY, /'archived_open_by_currency', archived_open_by_currency/);
  assert.match(EXTENSION_BODY, /coalesce\(i\.due_on, i\.period_end\) < current_date/);
});

// ---------------------------------------------------------------------------
// 4. Couche serveur et page — câblage sans bloquer le reste de la page
// ---------------------------------------------------------------------------

test("getFinanceBillingExtension appelle bien la nouvelle RPC et jamais l'ancienne", () => {
  const start = SERVER.indexOf("export async function getFinanceBillingExtension");
  const body = SERVER.slice(start, SERVER.indexOf("\n}", start));
  assert.match(body, /rpc\("admin_finance_billing_extension"/);
});

test("la page Finances récupère l'extension en parallèle sans la rendre bloquante pour le reste de la page", () => {
  assert.match(PAGE, /getFinanceBillingExtension\(period\)/);
  assert.match(PAGE, /Promise\.all\(\[[\s\S]{0,200}getFinanceBillingExtension/);
  // L'erreur affichée ne dépend que du résumé et des événements, jamais de l'extension seule.
  const errorLine = PAGE.split("\n").find((l) => l.includes("const error ="));
  assert.ok(errorLine, "ligne de calcul d'erreur introuvable");
  assert.doesNotMatch(errorLine!, /extensionResult/);
});

// ---------------------------------------------------------------------------
// 5. Vue — nouvelle section + correction du lien Organization manquant
// ---------------------------------------------------------------------------

test("la vue Finances affiche la nouvelle section seulement quand l'extension est disponible", () => {
  assert.match(VIEWS, /\{extension \? \(/);
  assert.match(VIEWS, /financeSectionManualInvoicing/);
  assert.match(VIEWS, /extension\.manualInvoicing\.dueByCurrency\.XAF/);
  assert.match(VIEWS, /extension\.manualInvoicing\.overdueByCurrency\.XAF/);
  assert.match(VIEWS, /extension\.manualInvoicing\.paymentsConfirmedCount/);
  assert.match(VIEWS, /extension\.reminders\.sentInPeriod/);
  assert.match(VIEWS, /extension\.reminders\.dueNow/);
  assert.match(VIEWS, /extension\.paymentFailuresInPeriod/);
});

test("le tableau des événements récents relie désormais chaque organisation à sa fiche Admin", () => {
  const start = VIEWS.indexOf("colEventOrganization");
  const rowsStart = VIEWS.indexOf("events.rows.map", start);
  const rowsBody = VIEWS.slice(rowsStart, rowsStart + 600);
  assert.match(rowsBody, /href=\{`\/administration\/organizations\/\$\{ev\.organizationId\}`\}/);
});

// ---------------------------------------------------------------------------
// 6. Copie FR/EN complète
// ---------------------------------------------------------------------------

test("chaque nouvelle clé de copie existe en FR et en EN", () => {
  const keys = [
    "financeSectionManualInvoicing", "financeManualInvoicesDueXaf", "financeManualInvoicesOverdueXaf",
    "financeManualPaymentsConfirmed", "financeManualPaymentsCollectedXaf", "financeManualPaymentsCollectedCad",
    "financeRemindersSent", "financeRemindersDueNow", "financePaymentFailures",
  ];
  for (const key of keys) {
    const occurrences = COPY.split(new RegExp(`\\b${key}\\b`)).length - 1;
    // 1 dans le type AdminCopy, 1 dans `fr`, 1 dans `en` = 3 occurrences.
    assert.equal(occurrences, 3, `${key} doit apparaître dans le type, fr et en (trouvé ${occurrences} fois)`);
  }
});

// ---------------------------------------------------------------------------
// 7. Le fichier pgTAP est cohérent et n'est pas déclaré exécuté
// ---------------------------------------------------------------------------

test("le fichier pgTAP 01E déclare exactement autant d'assertions que son plan()", () => {
  const clean = sansCommentaires(PGTAP);
  const planMatch = clean.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N) introuvable");
  const declared = Number(planMatch![1]);
  const assertions = (clean.match(/^select (is|ok|throws_ok)\(/gm) ?? []).length;
  assert.equal(assertions, declared);
});

test("le fichier pgTAP 01E s'exécute dans une transaction annulée (rollback)", () => {
  assert.match(PGTAP, /^begin;/);
  assert.match(PGTAP, /rollback;\s*$/);
});
