import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  isReceiptAvailable,
  isInvoiceOverdue,
  supportsManualInvoicing,
  MANUAL_INVOICING_CURRENCY,
} from "../src/core/billing/model.ts";
import { invoiceDocumentTitle } from "../src/core/billing/invoice-pdf.ts";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01B — Tests
// =============================================================================
// Même distinction méthodologique que ADMIN-BILLING-OPS-01/FINANCE-ADMIN-01 :
// invariants de source sur le SQL/TS réellement livré (aucun Supabase
// éphémère dans ce bac à sable — voir supabase/tests/database/
// rls_revenue_01b_manual_invoicing.test.sql, NON EXÉCUTÉ, plan(18) vérifié
// statiquement seulement) et tests unitaires réels pour tout ce qui est pur.
// =============================================================================

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260927150000_revenue_01b_manual_invoicing_africa.sql", import.meta.url),
  "utf8",
);
const PGTAP = readFileSync(
  new URL("../supabase/tests/database/rls_revenue_01b_manual_invoicing.test.sql", import.meta.url),
  "utf8",
);
const ACTIONS = readFileSync(
  new URL("../src/modules/platform-admin/manual-invoicing-actions.ts", import.meta.url),
  "utf8",
);
const INVOICE_PDF = readFileSync(
  new URL("../src/core/billing/invoice-pdf.ts", import.meta.url),
  "utf8",
);

function sansCommentaires(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Isole le corps d'une fonction SQL par son nom qualifié, jusqu'à son `$$;` de fin. */
function sqlFunctionBody(name: string): string {
  const start = MIGRATION.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `fonction absente de la migration : ${name}`);
  const end = MIGRATION.indexOf("$$;", start);
  assert.notEqual(end, -1, `fin de fonction introuvable : ${name}`);
  return MIGRATION.slice(start, end);
}

const NEW_RPCS = [
  "public.admin_issue_manual_invoice",
  "public.admin_confirm_manual_invoice_payment",
];

// ---------------------------------------------------------------------------
// 1. Sécurité des nouvelles RPC
// ---------------------------------------------------------------------------

test("les 2 nouvelles RPC vérifient l'autorisation plateforme avant toute opération", () => {
  for (const rpc of NEW_RPCS) {
    const body = sqlFunctionBody(rpc);
    assert.ok(body.includes("private.assert_platform_admin();"), `${rpc} n'appelle pas assert_platform_admin`);
  }
});

test("les 2 nouvelles RPC figent leur search_path", () => {
  for (const rpc of NEW_RPCS) {
    assert.ok(sqlFunctionBody(rpc).includes("set search_path = ''"), `${rpc} ne fige pas search_path`);
  }
});

test("aucun droit n'est jamais accordé à anon ni au rôle public sur les nouvelles RPC", () => {
  for (const rpc of NEW_RPCS) {
    const bareName = rpc.replace("public.", "");
    const revokePattern = new RegExp(`revoke all on function public\\.${bareName}\\(`);
    assert.ok(revokePattern.test(MIGRATION), `${rpc} n'a pas de revoke explicite`);
  }
  assert.ok(!/grant\s+execute[^;]*\bto\b[^;]*\banon\b/i.test(MIGRATION), "un grant execute a été accordé à anon");
});

// ---------------------------------------------------------------------------
// 2. Portée verrouillée Afrique/XAF, jamais Canada/CAD
// ---------------------------------------------------------------------------

test("l'émission d'une facture manuelle refuse toute Organization non-XAF", () => {
  const body = sqlFunctionBody("public.admin_issue_manual_invoice");
  assert.match(body, /sub\.currency\s*<>\s*'XAF'/);
  assert.match(body, /currency_not_supported/);
});

test("le catalogue de prix consulté est explicitement XAF, jamais CAD", () => {
  const body = sqlFunctionBody("public.admin_issue_manual_invoice");
  assert.match(body, /currency = 'XAF'/);
  assert.doesNotMatch(sansCommentaires(body), /'CAD'/);
});

test("model.ts expose la même portée verrouillée (XAF) côté TypeScript", () => {
  assert.equal(MANUAL_INVOICING_CURRENCY, "XAF");
  assert.equal(supportsManualInvoicing("XAF"), true);
  assert.equal(supportsManualInvoicing("CAD"), false);
});

// ---------------------------------------------------------------------------
// 3. Le serveur ne fait jamais confiance à un montant/devise déclaré seul
// ---------------------------------------------------------------------------

test("la confirmation exige une correspondance exacte devise + montant avec la facture", () => {
  const body = sqlFunctionBody("public.admin_confirm_manual_invoice_payment");
  assert.match(body, /p_currency is distinct from inv\.currency/);
  assert.match(body, /currency_mismatch/);
  assert.match(body, /p_amount_minor is distinct from inv\.amount_minor/);
  assert.match(body, /amount_mismatch/);
});

test("la confirmation est idempotente par l'état : une facture déjà payée renvoie already_paid", () => {
  const body = sqlFunctionBody("public.admin_confirm_manual_invoice_payment");
  assert.match(body, /if inv\.status = 'paid' then/);
  assert.match(body, /already_paid/);
});

test("l'émission est idempotente par jeton : rejouer la même clé renvoie already_issued, sans doublon", () => {
  const body = sqlFunctionBody("public.admin_issue_manual_invoice");
  assert.match(body, /issue_idempotency_key = p_idempotency_key/);
  assert.match(body, /already_issued/);
});

// ---------------------------------------------------------------------------
// 4. Séparation de domaines intacte
// ---------------------------------------------------------------------------

test("la migration ne touche jamais payments, dues, ledger_entries ni commercial_interventions", () => {
  const clean = sansCommentaires(MIGRATION);
  for (const forbidden of ["public.payments", "public.dues", "public.ledger_entries", "public.commercial_interventions"]) {
    assert.doesNotMatch(clean, new RegExp(forbidden.replace(".", "\\.")));
  }
});

test("aucun nom de provider n'apparaît dans la migration ni dans le générateur de facture", () => {
  for (const source of [sansCommentaires(MIGRATION), sansCommentaires(INVOICE_PDF)]) {
    assert.doesNotMatch(source, /stripe|flutterwave|campay|elyonpay|notchpay|payunit/i);
  }
});

test("provider_invoice_ref (colonne provider existante) n'est jamais écrit par le règlement manuel", () => {
  const body = sqlFunctionBody("public.admin_confirm_manual_invoice_payment");
  assert.doesNotMatch(body, /provider_invoice_ref/);
});

// ---------------------------------------------------------------------------
// 5. Reçu disponible seulement après paiement
// ---------------------------------------------------------------------------

test("un reçu n'est disponible qu'après paiement ; avant, seule une facture existe", () => {
  assert.equal(isReceiptAvailable("paid"), true);
  for (const status of ["draft", "open", "void", "uncollectible"] as const) {
    assert.equal(isReceiptAvailable(status), false, `${status} ne doit pas donner droit à un reçu`);
  }
});

test("le titre du document bascule Facture -> Reçu uniquement au passage à 'paid', en FR et EN", () => {
  assert.equal(invoiceDocumentTitle("open", "fr"), "Facture d'abonnement");
  assert.equal(invoiceDocumentTitle("open", "en"), "Subscription invoice");
  assert.equal(invoiceDocumentTitle("paid", "fr"), "Reçu d'abonnement");
  assert.equal(invoiceDocumentTitle("paid", "en"), "Subscription receipt");
});

test("une facture 'open' est en retard seulement après sa date de fin de période", () => {
  assert.equal(isInvoiceOverdue("open", "2026-10-01", "2026-09-30"), false);
  assert.equal(isInvoiceOverdue("open", "2026-10-01", "2026-10-02"), true);
  assert.equal(isInvoiceOverdue("paid", "2026-10-01", "2026-10-02"), false, "une facture payée n'est jamais en retard");
});

// ---------------------------------------------------------------------------
// 6. Server Actions — double barrière, aucune fuite de secret
// ---------------------------------------------------------------------------

test("les actions serveur revérifient is_platform_admin_self avant tout appel RPC", () => {
  assert.match(ACTIONS, /is_platform_admin_self/);
  assert.match(ACTIONS, /reason:\s*"denied"/);
});

test("les actions serveur ne renvoient jamais error.message brut à l'appelant", () => {
  assert.doesNotMatch(sansCommentaires(ACTIONS), /message:\s*error\.message/);
});

test("aucun secret ni clé API ne figure dans les nouveaux fichiers TypeScript de ce lot", () => {
  for (const source of [sansCommentaires(ACTIONS), sansCommentaires(INVOICE_PDF)]) {
    assert.doesNotMatch(source, /sk_live|sk_test|api[_-]?key|webhook_secret/i);
  }
});

// ---------------------------------------------------------------------------
// 7. Le fichier pgTAP existe, est cohérent, et n'est PAS déclaré exécuté
// ---------------------------------------------------------------------------

test("le fichier pgTAP déclare exactement autant d'assertions que son plan()", () => {
  const clean = sansCommentaires(PGTAP);
  const planMatch = clean.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N) introuvable");
  const declared = Number(planMatch![1]);
  const assertions = (clean.match(/^select (is|ok)\(/gm) ?? []).length;
  assert.equal(assertions, declared, "le nombre d'assertions ne correspond pas au plan() déclaré");
});

test("le fichier pgTAP s'exécute dans une transaction annulée (rollback), sans donnée persistée", () => {
  assert.match(PGTAP, /^begin;/);
  assert.match(PGTAP, /rollback;\s*$/);
});
