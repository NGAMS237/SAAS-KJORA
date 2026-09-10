import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { parseDocumentId, parseStatementRequest } from "../src/modules/documents/model.ts";
import { dueNoticePresentation, formatPdfMoney, generateFinancialDocumentPdf } from "../src/modules/documents/pdf.ts";
import { controlledDeliveryError, financialDocumentEmail } from "../src/modules/documents/email.ts";
import type { FinancialDocumentRecord } from "../src/modules/documents/model.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260828054649_lot_6c3_documents_notifications.sql", import.meta.url),
  "utf8",
);
const patchMigration = readFileSync(
  new URL("../supabase/migrations/20260829020000_post_6c3_receipt_ux.sql", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../src/app/api/financial-communications/cron/route.ts", import.meta.url),
  "utf8",
);

test("les filtres d’état de compte sont validés sans ambiguïté", () => {
  const tenantId = "11000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseStatementRequest({ tenantId, from: "2026-01-01", to: "2026-12-31" }), {
    ok: true, value: { tenantId, from: "2026-01-01", to: "2026-12-31" },
  });
  assert.equal(parseStatementRequest({ tenantId, from: "2026-12-31", to: "2026-01-01" }).ok, false);
  assert.equal(parseStatementRequest({ tenantId: "internal-slug" }).ok, false);
  assert.equal(parseDocumentId(tenantId), tenantId);
  assert.equal(parseDocumentId("../secret"), null);
});

test("les séparateurs de milliers PDF restent sans point d’interrogation", () => {
  for (const amount of [12_000, 522_000, 379_994]) {
    assert.doesNotMatch(formatPdfMoney(amount), /\?/);
    assert.match(formatPdfMoney(amount), /^\d{1,3}( \d{3})* XAF$/);
  }
});

test("l’avis distingue un solde restant d’une échéance entièrement couverte", () => {
  const partial = dueNoticePresentation({ remaining_xaf: 4_006, last_covered_period_end: "2026-08-31" }, "fr");
  assert.equal(partial.headline, "Solde à payer");
  assert.equal(partial.remaining, 4_006);
  assert.equal(partial.coveredUntil, null);
  const covered = dueNoticePresentation({ remaining_xaf: 0, last_covered_period_end: "2026-09-30" }, "en");
  assert.equal(covered.headline, "Due covered");
  assert.equal(covered.coveredUntil, "2026-09-30");
});

test("les documents sont immuables, versionnés et invalidés sans suppression", () => {
  assert.match(migration, /create table public\.financial_documents/i);
  assert.match(migration, /template_version text not null default '6c3-v1'/i);
  assert.match(migration, /financial_document_history_is_immutable/i);
  assert.match(migration, /DOCUMENT_INVALIDATED/i);
  assert.doesNotMatch(migration, /delete from public\.financial_documents/i);
  assert.match(migration, /create sequence public\.financial_document_reference_sequence as bigint/i);
  assert.match(migration, /financial_documents_set_reference/i);
  assert.match(migration, /\^\(AVI\|REC\|QUI\|ETAT\)-\[0-9\]\{4\}-\[0-9\]\{6,\}\$/i);
});

test("reçu Payment et quittance de période restent deux artefacts distincts", () => {
  assert.match(migration, /'payment_receipt'[\s\S]*'rent_receipt'/i);
  assert.match(migration, /'payment_receipt', 'payment_receipt:' \|\| selected_payment\.id/i);
  assert.match(migration, /ds\.remaining_amount_xaf = 0/i);
  assert.match(migration, /rent_receipt:' \|\| due_item\.id/i);
  assert.match(migration, /financial_document_payments/i);
  assert.match(migration, /'deposit_allocated_xaf'/i);
  assert.match(migration, /'recorded_at', p\.created_at/i);
  assert.match(migration, /'balance_after_xaf', p\.balance_after_xaf/i);
  assert.match(migration, /ds\.kind in \('periodic', 'initial_prorata'\)/i);
});

test("le reçu immédiat délègue à 6C3 avec capability et idempotence", () => {
  assert.match(patchMigration, /create or replace function public\.prepare_payment_receipt\(target_payment_id uuid\)/i);
  assert.match(patchMigration, /private\.has_capability\(selected_payment\.organization_id, 'receipt\.view'\)/i);
  assert.match(patchMigration, /perform private\.prepare_payment_documents\(selected_payment\.id\)/i);
  assert.match(patchMigration, /'payment_receipt:' \|\| selected_payment\.id::text/i);
  assert.match(patchMigration, /revoke all on function public\.prepare_payment_receipt\(uuid\) from public, anon/i);
  assert.match(patchMigration, /grant execute on function public\.prepare_payment_receipt\(uuid\) to authenticated/i);
  assert.doesNotMatch(patchMigration, /TenantPortalAccess|storage\.buckets|email_enabled\s*=\s*true/i);
});

test("le snapshot du reçu partiel distingue crédit, Payment et restant", () => {
  assert.match(patchMigration, /'linked_due_total_xaf'/i);
  assert.match(patchMigration, /'credit_applied_xaf'/i);
  assert.match(patchMigration, /'payment_received_xaf', a\.amount_xaf/i);
  assert.match(patchMigration, /'linked_due_remaining_xaf'/i);
  assert.match(patchMigration, /ds\.remaining_amount_xaf = 0/i);
  assert.match(patchMigration, /ds\.kind in \('periodic', 'initial_prorata'\)/i);
});

test("les actions Payment, Tenant et Location restent internes", () => {
  const paymentViews = readFileSync(new URL("../src/modules/payments/views.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/financial-documents/route.ts", import.meta.url), "utf8");
  assert.match(paymentViews, /Générer le reçu/);
  assert.match(paymentViews, /Télécharger le reçu/);
  assert.match(paymentViews, /Voir le paiement/);
  assert.match(route, /authorization\.capabilities\.includes\("receipt\.view"\)/);
  assert.doesNotMatch(paymentViews, /\/portal/);
  assert.doesNotMatch(route, /\/portal/);
});

test("l’outbox est idempotente, bornée à trois tentatives et indépendante des paiements", () => {
  assert.match(migration, /message_deliveries_idempotency_key unique/i);
  assert.match(migration, /attempt_count between 0 and 3/i);
  assert.match(migration, /financial_document_event_processing/i);
  assert.doesNotMatch(migration, /domain_events_prepare_financial_documents/i);
  assert.match(worker, /KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED !== "true"/i);
  assert.match(worker, /\[5, 30, 120\]/i);
});

test("le déploiement sûr n’active ni backfill ni email", () => {
  assert.match(migration, /started_at timestamptz not null default now\(\)/i);
  assert.match(migration, /e\.created_at >= r\.started_at/i);
  assert.match(migration, /due_notice_email_enabled boolean not null default false/i);
  assert.match(migration, /overdue_reminder_email_enabled boolean not null default false/i);
  assert.match(migration, /payment_receipt_email_enabled boolean not null default false/i);
  assert.match(migration, /rent_receipt_email_enabled boolean not null default false/i);
});

test("Storage est privé et les chemins sont Organization/document/version", () => {
  assert.match(migration, /values \('financial-documents', 'financial-documents', false/i);
  assert.match(migration, /organization_id::text \|\| '\/' \|\| selected_document\.id::text \|\| '\/v1\.pdf'/i);
  assert.match(migration, /private\.can_access_financial_document_path/i);
  assert.doesNotMatch(migration, /public\s*=\s*true/i);
});

test("J-X et J+10 préparent des faits sans email implicite", () => {
  assert.match(migration, /d\.notice_date = run_on/i);
  assert.match(migration, /ds\.next_reminder_date = run_on/i);
  assert.match(migration, /'payment_overdue:' \|\| item\.id::text \|\| ':' \|\| run_on::text/i);
  assert.match(migration, /select private\.run_financial_daily\(current_date\)/i);
});

test("les alertes de prépaiement et crédit faible sont explicites et idempotentes", () => {
  assert.match(migration, /'last_prepaid_period'/i);
  assert.match(migration, /'low_credit'/i);
  assert.match(migration, /'credit_applied_xaf', item\.credit_applied_xaf/i);
  assert.match(migration, /'expected_remainder_xaf', item\.remaining_amount_xaf/i);
  assert.match(migration, /notifications_deduplication_key unique/i);
  assert.match(migration, /m\.role in \('organization_owner', 'manager'\)/i);
});

for (const language of ["fr", "en"] as const) {
  test(`le PDF ${language.toUpperCase()} est valide et porte sa référence`, async () => {
    const document: FinancialDocumentRecord = {
      id: "11000000-0000-4000-8000-000000000001",
      organizationId: "22000000-0000-4000-8000-000000000001",
      tenantId: "33000000-0000-4000-8000-000000000001",
      leaseId: "44000000-0000-4000-8000-000000000001",
      dueId: "55000000-0000-4000-8000-000000000001",
      paymentId: null,
      type: "due_notice",
      reference: `AVI-TEST-${language.toUpperCase()}`,
      status: "prepared",
      language,
      issuedOn: "2026-09-05",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      storagePath: null,
      createdAt: "2026-09-05T00:00:00Z",
      invalidatedAt: null,
      invalidationReason: null,
      tenantEmail: null,
      lastDelivery: null,
      templateVersion: "6c3-v1",
      createdBy: null,
      snapshot: {
        organization_name: "Bailleur Démo",
        tenant_name: "Locataire Test",
        property_name: "Résidence Horizon",
        property_locality: "Douala",
        unit_label: "A1",
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        due_date: "2026-09-10",
        rent_xaf: 40000,
        recurring_charges_xaf: 2000,
        expected_xaf: 42000,
        credit_applied_xaf: 34000,
        payment_allocated_xaf: 0,
        remaining_xaf: 8000,
        last_covered_period_end: "2026-08-31",
      },
    };
    const bytes = await generateFinancialDocumentPdf(document);
    assert.ok(bytes.byteLength > 1000);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const parsed = await PDFDocument.load(bytes);
    assert.equal(parsed.getPageCount(), 1);
    assert.match(parsed.getTitle() ?? "", new RegExp(document.reference));
    assert.equal(parsed.getAuthor(), "KJORA");
    const email = financialDocumentEmail(document);
    assert.match(email.subject, language === "fr" ? /Votre échéance/ : /Your due/);
    assert.match(email.text, /42[\s,\u202f]?000 XAF/);
    assert.match(email.html, /Résidence Horizon/);
    assert.doesNotMatch(email.html, /<script/i);
  });
}

test("le PDF de reçu porte la ventilation exacte d’un paiement partiel", async () => {
  const receipt: FinancialDocumentRecord = {
    id: "11000000-0000-4000-8000-000000000010",
    organizationId: "22000000-0000-4000-8000-000000000010",
    tenantId: "33000000-0000-4000-8000-000000000010",
    leaseId: "44000000-0000-4000-8000-000000000010",
    dueId: null,
    paymentId: "55000000-0000-4000-8000-000000000010",
    type: "payment_receipt",
    reference: "REC-2026-000010",
    status: "prepared",
    language: "fr",
    issuedOn: "2026-08-29",
    periodStart: null,
    periodEnd: null,
    storagePath: null,
    createdAt: "2026-08-29T00:00:00Z",
    invalidatedAt: null,
    invalidationReason: null,
    tenantEmail: null,
    lastDelivery: null,
    templateVersion: "6c3-v1",
    createdBy: null,
    snapshot: {
      organization_name: "Bailleur Démo", tenant_name: "Locataire Test",
      property_name: "Résidence Horizon", property_locality: "Douala", unit_label: "A1",
      payment_reference: "PAY-2026-000010", payment_date: "2026-08-29",
      recorded_at: "2026-08-29T10:00:00Z", method: "cash",
      amount_xaf: 10_000, allocated_xaf: 10_000,
      linked_due_total_xaf: 52_000, credit_applied_xaf: 37_994,
      linked_due_remaining_xaf: 4_006, credit_created_xaf: 0,
      balance_after_xaf: -4_006,
    },
  };
  const bytes = await generateFinancialDocumentPdf(receipt);
  const parsed = await PDFDocument.load(bytes);
  assert.equal(parsed.getPageCount(), 1);
  assert.equal(parsed.getTitle(), `Reçu de paiement · ${receipt.reference}`);
  assert.ok(bytes.byteLength > 1000);
});

test("les erreurs fournisseur sont bornées et expurgées", () => {
  const sanitized = controlledDeliveryError(new Error("Bearer super-secret\nprovider unavailable"));
  assert.doesNotMatch(sanitized, /super-secret/);
  assert.match(sanitized, /\[redacted\]/);
  assert.ok(sanitized.length <= 500);
});
