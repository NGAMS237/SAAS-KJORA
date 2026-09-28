import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260928201341_billing_africa_recurring_01.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../src/modules/platform-admin/manual-invoicing-actions.ts", import.meta.url),
  "utf8",
);

test("la confirmation manuelle exige une date métier explicite", () => {
  assert.match(migration, /p_received_on date/);
  assert.match(migration, /p_received_on is null or p_received_on > current_date/);
  assert.match(actions, /p_received_on: receivedOn/);
});

test("l'ancien chemin sans date n'est plus exécutable par authenticated", () => {
  assert.match(
    migration,
    /revoke execute on function public\.admin_confirm_manual_invoice_payment\([\s\S]*?uuid, text, bigint, text, text, text[\s\S]*?\) from authenticated/,
  );
});

test("un rejeu conserve date et clé d'idempotence", () => {
  assert.match(migration, /payment_idempotency_key = p_idempotency_key/);
  assert.match(migration, /manual_payment_received_on is not distinct from p_received_on/);
  assert.match(migration, /payment_idempotency_conflict/);
});

test("la migration ne touche jamais aux tables de loyers", () => {
  const code = migration.replace(/--.*$/gm, "");
  for (const table of ["payments", "dues", "ledger_entries", "financial_documents"]) {
    assert.doesNotMatch(code, new RegExp(`public\\.${table}\\b`));
  }
});
