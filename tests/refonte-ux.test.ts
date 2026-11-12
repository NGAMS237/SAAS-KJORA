import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { nextPeriodPreview } from "../src/modules/tenancy/next-period.ts";
import { parseDocumentRenderContext } from "../src/modules/documents/render-context.ts";
import { documentMonthLabel, generateFinancialDocumentPdf, paymentMethodLabel } from "../src/modules/documents/pdf.ts";
import { buildSampleDocument } from "../src/modules/documents/sample.ts";
import { internalPrimaryNavigation, internalSecondaryNavigation } from "../src/core/navigation/navigation.ts";

test("prochaine période : avis préparé N jours avant l'échéance du mois", () => {
  const p = nextPeriodPreview({ nextPeriodStart: "2026-12-01", dueDay: 5, generateDueDaysBefore: 5, totalXaf: 27000 });
  assert.deepEqual(p, { periodStart: "2026-12-01", periodEnd: "2026-12-31", dueDate: "2026-12-05", noticeDate: "2026-11-30", totalXaf: 27000 });
  assert.equal(nextPeriodPreview({ nextPeriodStart: "2027-02-01", dueDay: 31, generateDueDaysBefore: 1, totalXaf: 1 }).dueDate, "2027-02-28");
});

test("contexte de rendu : valeurs invalides ignorées, images limitées à PNG/JPG", () => {
  const ctx = parseDocumentRenderContext({ tenantCivility: "Dr", arrearsXaf: -5, branding: { displayName: "Cité", logoDataUrl: "data:image/svg+xml;base64,AAA" } });
  assert.equal(ctx.tenantCivility, null);
  assert.equal(ctx.arrearsXaf, 0);
  assert.equal(ctx.branding?.displayName, "Cité");
  assert.equal(ctx.branding?.logoDataUrl, null);
  assert.deepEqual(parseDocumentRenderContext(null), {});
});

test("libellés : mois du document et moyen de paiement", () => {
  assert.equal(documentMonthLabel("2026-11-01", "fr"), "NOVEMBRE 2026");
  assert.equal(paymentMethodLabel("mtn_momo", "fr"), "MTN Mobile Money");
  assert.equal(paymentMethodLabel("cash", "en"), "Cash");
});

test("avis avec arriéré et informations bailleur : PDF d'une page", async () => {
  const bytes = await generateFinancialDocumentPdf(buildSampleDocument("due_notice", new Date("2026-11-10T00:00:00Z")), {
    tenantCivility: "M.", arrearsXaf: 222_000,
    branding: { displayName: "Cité Veraluz", representative: "B. N.", phone: "+237 6", email: null, address: "Yaoundé", paymentInstructions: "MTN Mobile Money", noticeFooter: "Avant le 5", receiptFooter: null, logoDataUrl: null, signatureDataUrl: null },
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getAuthor(), "KJORA");
});

test("navigation : Finances regroupe échéances et paiements, 5 entrées mobiles au plus", () => {
  const finances = internalPrimaryNavigation.find((item) => item.href === "/app/finances");
  assert.deepEqual(finances?.alsoActive, ["/app/echeances", "/app/paiements"]);
  assert.ok(internalPrimaryNavigation.filter((item) => item.mobile).length <= 5);
  assert.ok(internalSecondaryNavigation.some((item) => item.href === "/app/activite"));
});
