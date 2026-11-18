import assert from "node:assert/strict";
import test from "node:test";
import { financialDocumentFileName, pdfContentDisposition } from "../src/modules/documents/model.ts";

test("nom de fichier : titre, locataire, mois visé, référence", () => {
  const name = financialDocumentFileName({ type: "rent_receipt", reference: "QUI-2026-000012", issuedOn: "2026-11-17", periodStart: "2026-11-01" }, "Julis Sounhafo");
  assert.equal(name, "Quittance de loyer - Julis Sounhafo - 2026-11 - QUI-2026-000012.pdf");
});

test("nom de fichier : date d'émission sans période, caractères interdits retirés", () => {
  const name = financialDocumentFileName({ type: "payment_receipt", reference: "PAY-1", issuedOn: "2026-11-17", periodStart: null }, 'A/B:"C"');
  assert.equal(name, "Reçu de paiement - A B C - 2026-11-17 - PAY-1.pdf");
});

test("Content-Disposition : repli ASCII et UTF-8", () => {
  const header = pdfContentDisposition("inline", "Reçu de paiement - Élise - 2026-11.pdf");
  assert.match(header, /filename="Recu de paiement - Elise - 2026-11\.pdf"/);
  assert.match(header, /filename\*=UTF-8''Re%C3%A7u/);
});
