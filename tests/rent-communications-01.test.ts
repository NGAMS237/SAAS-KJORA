import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260928203009_rent_communications_01.sql");
const route = read("../src/app/api/financial-documents/route.ts");
const download = read("../src/app/api/financial-documents/[documentId]/download/route.ts");
const view = read("../src/modules/documents/views.tsx");

test("les états de compte commencent en revue et restent immuables", () => {
  assert.match(migration, /document_type = 'account_statement'/);
  assert.match(migration, /review_status := 'draft'/);
  assert.match(migration, /financial_document_history_is_immutable/);
  assert.match(migration, /supersedes_document_id/);
});

test("approbation et report exigent receipt.share et sont audités", () => {
  assert.match(migration, /private\.has_capability\(doc\.organization_id,'receipt\.share'\)/);
  assert.match(migration, /FINANCIAL_DOCUMENT_REVIEWED/);
  assert.match(route, /input\.action === "approve" \|\| input\.action === "defer"/);
});

test("un document non approuvé ne peut pas être mis en file", () => {
  assert.match(migration, /message_deliveries_require_approved_document/);
  assert.match(migration, /review_status='approved'/);
});

test("la prévisualisation ne matérialise pas le document dans le portail", () => {
  assert.match(download, /searchParams\.get\("preview"\) === "1"/);
  assert.match(download, /renderFinancialDocumentPreview/);
  assert.match(download, /document\.reviewStatus !== "approved"/);
});

test("l'interface empêche les doubles clics et expose approuver/différer en FR et EN", () => {
  assert.match(view, /disabled=\{busy\}/);
  assert.match(view, /"Approuver", "Approve"/);
  assert.match(view, /"Différer", "Defer"/);
});
