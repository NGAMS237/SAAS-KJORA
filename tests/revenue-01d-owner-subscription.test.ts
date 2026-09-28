import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01D — Espace abonnement propriétaire
// =============================================================================
// Audit préalable (voir session) : la page Owner (billing/page.tsx) et sa vue
// (billing-view.tsx) existaient déjà et couvraient déjà la quasi-totalité du
// périmètre 01D (plan, cycle, devise, prochaine échéance, état, grâce,
// historique, changement de forfait préparé, annulation fin de période,
// réactivation, messages explicites si paiement automatique non connecté,
// provider jamais révélé). Le seul manque réellement prouvé : aucune facture
// ni aucun reçu n'était téléchargeable. Ce lot n'ajoute QUE cela — une route
// de téléchargement PDF réutilisant `invoice-pdf.ts` (REVENUE-01B) — et ne
// reconstruit rien de ce qui existait déjà.
// =============================================================================

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
function sansCommentaires(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const BILLING_VIEW = read("../src/core/billing/billing-view.tsx");
// v3 : la génération est partagée (core/billing/invoice-download.ts) entre la
// route Owner et le contexte limité d'une Organization suspendue — la route
// garde la vérification de capacité, l'aide partagée garde le reste.
const DOWNLOAD_ROUTE =
  read("../src/app/api/billing/invoices/[invoiceId]/download/route.ts") +
  "\n" +
  read("../src/core/billing/invoice-download.ts");
const SERVER = read("../src/core/billing/server.ts");

// ---------------------------------------------------------------------------
// 1. Le manque comblé : facture/reçu téléchargeable depuis l'espace Owner
// ---------------------------------------------------------------------------

test("chaque facture XAF de l'historique propose un lien de téléchargement PDF", () => {
  assert.match(BILLING_VIEW, /facture\.currency === "XAF"/);
  assert.match(BILLING_VIEW, /\/api\/billing\/invoices\/\$\{facture\.id\}\/download/);
});

test("le libellé du téléchargement distingue facture (avant paiement) et reçu (après)", () => {
  assert.match(BILLING_VIEW, /isReceiptAvailable\(facture\.status\)/);
  assert.match(BILLING_VIEW, /Télécharger le reçu/);
  assert.match(BILLING_VIEW, /Télécharger la facture/);
});

test("la route de téléchargement exige la capability billing.view avant toute lecture", () => {
  const idxCheck = DOWNLOAD_ROUTE.indexOf("capabilities.includes(\"billing.view\")");
  const idxFetch = DOWNLOAD_ROUTE.indexOf("getBillingInvoiceForDownload(");
  assert.notEqual(idxCheck, -1, "vérification billing.view absente");
  assert.notEqual(idxFetch, -1, "lecture de la facture absente");
  assert.ok(idxCheck < idxFetch, "la capability doit être vérifiée avant toute lecture de facture");
});

test("la route de téléchargement refuse toute facture non-XAF (aucun document Canada tant que rien n'est activé)", () => {
  assert.match(DOWNLOAD_ROUTE, /invoice\.currency !== "XAF"/);
  assert.match(sansCommentaires(DOWNLOAD_ROUTE), /not_available/);
});

test("la route de téléchargement sert un PDF, jamais du JSON, en cas de succès", () => {
  assert.match(DOWNLOAD_ROUTE, /"content-type":\s*"application\/pdf"/);
  assert.match(DOWNLOAD_ROUTE, /"cache-control":\s*"private, no-store"/);
});

test("getBillingInvoiceForDownload réutilise list_billing_invoices (déjà gardée par billing.view) plutôt qu'une RPC concurrente", () => {
  const start = SERVER.indexOf("export async function getBillingInvoiceForDownload");
  assert.notEqual(start, -1, "fonction absente de server.ts");
  const body = SERVER.slice(start, SERVER.indexOf("\n}", start));
  assert.match(body, /rpc\("list_billing_invoices"/);
  assert.doesNotMatch(body, /rpc\("get_billing_invoice/, "aucune nouvelle RPC ne doit être introduite pour ce besoin");
});

test("la nouvelle route de téléchargement ne nomme aucun fournisseur de paiement", () => {
  // billing-view.tsx mentionne déjà, légitimement et depuis avant ce lot,
  // "Checkout Stripe" dans un message qui RASSURE l'utilisateur qu'aucun
  // paiement Stripe n'est lancé (architecture Canada préparée mais inerte,
  // décision verrouillée REVENUE-LAUNCH-01) — ce n'est pas une fuite du
  // fournisseur retenu, donc volontairement hors du périmètre de ce test.
  assert.doesNotMatch(sansCommentaires(DOWNLOAD_ROUTE), /\bstripe\b|\bflutterwave\b|\bcampay\b|\belyonpay\b|\bnotchpay\b|\bpayunit\b/i);
});

test("la vue Owner ne révèle que le fournisseur Stripe Test explicitement activable, jamais le routage interne Afrique", () => {
  // BILLING-STRIPE-SAAS-01 rend volontairement visible le parcours sandbox
  // Canada. Les fournisseurs étudiés pour l'Afrique et les secrets de routage
  // restent strictement absents de la vue Owner.
  const view = sansCommentaires(BILLING_VIEW);
  assert.match(view, /Stripe Test/);
  assert.doesNotMatch(view, /\bflutterwave\b|\bcampay\b|\belyonpay\b|\bnotchpay\b|\bpayunit\b/i);
  assert.doesNotMatch(view, /secret|webhook|price[_-]?id/i);
});

// ---------------------------------------------------------------------------
// 2. Le périmètre déjà couvert par l'existant reste intact (non-régression)
// ---------------------------------------------------------------------------

test("l'espace Owner affiche déjà plan, cycle, devise, prochaine échéance et grâce (existant, non reconstruit)", () => {
  assert.match(BILLING_VIEW, /sub\.renewalDate/);
  assert.match(BILLING_VIEW, /sub\.graceEndsOn/);
  assert.match(BILLING_VIEW, /BILLING_CYCLE_LABELS\[sub\.billingCycle\]/);
  assert.match(BILLING_VIEW, /formatAmount\(prixCourant, sub\.currency\)/);
});

test("l'espace Owner prépare déjà un changement de forfait sans jamais activer ni encaisser côté client", () => {
  assert.match(BILLING_VIEW, /action:\s*"change_plan"/);
  assert.match(BILLING_VIEW, /upgrade_intent_recorded/);
  assert.match(BILLING_VIEW, /downgrade_scheduled/);
});

test("l'espace Owner permet déjà l'annulation en fin de période et la réactivation", () => {
  assert.match(BILLING_VIEW, /action:\s*"cancel"/);
  assert.match(BILLING_VIEW, /action:\s*"reactivate"/);
  assert.match(BILLING_VIEW, /action:\s*"resume"/);
});

test("l'espace Owner affiche déjà un message explicite quand le paiement automatique n'est pas connecté", () => {
  assert.match(BILLING_VIEW, /CHECKOUT_UNAVAILABLE_MESSAGES/);
  assert.match(BILLING_VIEW, /no_provider_configured/);
});

test("l'espace Owner ne révèle jamais quel fournisseur interne est retenu (le client observe seulement une affordance)", () => {
  assert.match(BILLING_VIEW, /affordance\.online && affordance\.recurrence/);
  assert.doesNotMatch(sansCommentaires(BILLING_VIEW), /affordance\.provider/);
});
