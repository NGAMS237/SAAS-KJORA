import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentReceiptMessage, paymentReceiptKind } from "../src/modules/payments/receipt-message.ts";

const base = { tenantName: "michelle kegne", civility: null, unitLabel: "petite Chambre Etage E4", amountXaf: 16000, paymentDate: "2026-11-17", methodLabel: "Espèces",
  allocations: [{ periodStart: "2026-11-01", dueKind: "periodic" }], creditCreatedXaf: 0, balanceAfterXaf: 0, withPdf: true, portalUrl: "https://kjorapp.com/portal/recus/" };

test("types de paiement : solde, acompte, avance", () => {
  assert.equal(paymentReceiptKind(0, 0), "settled");
  assert.equal(paymentReceiptKind(-5000, 0), "partial");
  assert.equal(paymentReceiptKind(14000, 14000), "advance");
});

test("paiement qui solde : compte à jour, mois, reçu joint et lien", () => {
  const { kind, body } = buildPaymentReceiptMessage(base);
  assert.equal(kind, "settled");
  assert.match(body, /^Bonjour Michelle,/);
  assert.match(body, /16[\s  ]000 XAF \(Espèces\) le 17\/11\/2026 pour le loyer de novembre 2026/);
  assert.match(body, /Votre compte est à jour/);
  assert.match(body, /ci-joint votre reçu de paiement/);
  assert.match(body, /https:\/\/kjorapp\.com\/portal\/recus\//);
});

test("paiement partiel : acompte et reste à régler", () => {
  const { kind, body } = buildPaymentReceiptMessage({ ...base, amountXaf: 10000, balanceAfterXaf: -6000 });
  assert.equal(kind, "partial");
  assert.match(body, /paiement partiel \(acompte\)/);
  assert.match(body, /Il reste 6[\s  ]000 XAF à régler/);
});

test("avance : crédit déduit des prochains loyers ; sans PDF, pas de « ci-joint »", () => {
  const { kind, body } = buildPaymentReceiptMessage({ ...base, amountXaf: 30000, creditCreatedXaf: 14000, balanceAfterXaf: 14000, withPdf: false, portalUrl: null });
  assert.equal(kind, "advance");
  assert.match(body, /14[\s  ]000 XAF sont enregistrés en avance/);
  assert.doesNotMatch(body, /ci-joint/);
  assert.match(body, /Votre reçu de paiement est disponible\./);
  assert.doesNotMatch(body, /  /);
});

test("plusieurs mois et dépôt de garantie", () => {
  const { body } = buildPaymentReceiptMessage({ ...base, allocations: [{ periodStart: "2026-11-01", dueKind: "periodic" }, { periodStart: "2026-12-01", dueKind: "periodic" }, { periodStart: "2026-11-01", dueKind: "deposit" }] });
  assert.match(body, /loyer de novembre 2026, loyer de décembre 2026 et dépôt de garantie/);
});

test("autres documents : le message annonce le PDF joint seulement quand il l'est", async () => {
  const { buildManualWhatsAppMessage } = await import("../src/modules/communications/manual-whatsapp.ts");
  const ctx = { phoneE164: "+237699001122", displayName: "Julis Sounhafo", civility: null, amountXaf: 19000, dueDate: null, language: "fr" as const, documentType: "rent_receipt" as const, periodStart: "2026-11-01", periodEnd: "2026-11-30" };
  const avec = buildManualWhatsAppMessage(ctx, "https://kjorapp.com/portal/recus/", { withPdf: true });
  assert.match(avec, /quittance de loyer \(2026-11-01 – 2026-11-30\) de 19[\s  ]000 XAF est disponible\. Vous trouverez le PDF ci-joint\./);
  assert.match(avec, /Cordialement\.$/);
  const sans = buildManualWhatsAppMessage(ctx, "https://kjorapp.com/portal/recus/");
  assert.doesNotMatch(sans, /ci-joint/);
  assert.match(sans, /Consultez et téléchargez le PDF/);
});
