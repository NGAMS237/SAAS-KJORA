import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parsePaymentInput,
  proposeInitialPaymentAllocations,
  proposePaymentAllocations,
  reconcilePaymentAllocation,
  type PaymentDueOption,
} from "../src/modules/payments/model.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260827230000_lot_6c2_payments_allocations.sql", import.meta.url),
  "utf8",
);

function due(id: string, remainingXaf: number, dueDate: string, kind: PaymentDueOption["kind"] = "periodic"): PaymentDueOption {
  return {
    id, kind, reference: `DUE-${id}`, periodStart: dueDate.slice(0, 8) + "01",
    periodEnd: dueDate.slice(0, 8) + "28", dueDate, rentXaf: remainingXaf,
    recurringChargesXaf: 0, depositXaf: kind === "deposit" ? remainingXaf : 0,
    remainingXaf, status: "due",
  };
}

test("cas A et B: paiement partiel puis exact", () => {
  const open = [due("a", 55_000, "2026-08-05")];
  assert.deepEqual(proposePaymentAllocations(open, 45_000, "2026-08-10"), {
    allocations: [{ dueId: "a", amountXaf: 45_000 }], allocatedXaf: 45_000, creditCreatedXaf: 0,
  });
  assert.deepEqual(proposePaymentAllocations(open, 55_000, "2026-08-10"), {
    allocations: [{ dueId: "a", amountXaf: 55_000 }], allocatedXaf: 55_000, creditCreatedXaf: 0,
  });
});

test("cas C: le surpaiement devient un crédit exact", () => {
  const result = proposePaymentAllocations([due("a", 55_000, "2026-08-05")], 75_000, "2026-08-10");
  assert.equal(result.allocatedXaf, 55_000);
  assert.equal(result.creditCreatedXaf, 20_000);
});

test("cas D: 100 000 couvre 42k + 42k + 16k dans l’ordre", () => {
  const result = proposePaymentAllocations([
    due("sep", 42_000, "2026-09-05"), due("oct", 42_000, "2026-10-05"),
    due("nov", 42_000, "2026-11-05"),
  ], 100_000, "2026-11-05");
  assert.deepEqual(result.allocations.map((item) => item.amountXaf), [42_000, 42_000, 16_000]);
  assert.equal(result.creditCreatedXaf, 0);
});

test("cas E et F: plusieurs paiements se réconcilient et le crédit existant réduit le restant", () => {
  assert.deepEqual(reconcilePaymentAllocation(42_000, [
    { dueId: "p1", amountXaf: 20_000 }, { dueId: "p2", amountXaf: 12_000 },
    { dueId: "p3", amountXaf: 10_000 },
  ]), { allocatedXaf: 42_000, creditCreatedXaf: 0, reconciles: true });
  assert.equal(proposePaymentAllocations([due("after-credit", 32_000, "2026-08-05")], 32_000, "2026-08-10").allocatedXaf, 32_000);
});

test("l’allocation automatique ignore dépôt et échéances futures", () => {
  const result = proposePaymentAllocations([
    due("deposit", 40_000, "2026-08-01", "deposit"),
    due("current", 42_000, "2026-08-05"),
    due("future", 42_000, "2026-09-05"),
  ], 100_000, "2026-08-10");
  assert.deepEqual(result.allocations, [{ dueId: "current", amountXaf: 42_000 }]);
  assert.equal(result.creditCreatedXaf, 58_000);
});

test("l’encaissement initial ventile dépôt, échéances et crédit", () => {
  const open = [due("deposit", 60_000, "2026-08-01", "deposit"), due("rent-1", 70_000, "2026-08-05"), due("rent-2", 70_000, "2026-08-05")];
  const combined = proposeInitialPaymentAllocations(open, 200_000, "2026-08-10");
  assert.deepEqual(combined.allocations.map(({ dueId, amountXaf }) => [dueId, amountXaf]), [["deposit", 60_000], ["rent-1", 70_000], ["rent-2", 70_000]]);
  assert.equal(combined.creditCreatedXaf, 0);
  assert.deepEqual(proposeInitialPaymentAllocations(open, 30_000, "2026-08-10").allocations, [{ dueId: "deposit", amountXaf: 30_000 }]);
  assert.equal(proposeInitialPaymentAllocations([], 200_000, "2026-08-10").creditCreatedXaf, 200_000);
  assert.equal(proposeInitialPaymentAllocations([due("rent", 80_000, "2026-08-05")], 200_000, "2026-08-10").creditCreatedXaf, 120_000);
});

test("les quatre moyens MVP et les montants XAF entiers sont validés", () => {
  const base = {
    leaseId: "11000000-0000-4000-8000-000000000001", amountXaf: 42_000,
    paymentDate: "2026-08-27", externalReference: "REF-1", note: "Paiement réel",
    idempotencyKey: "11000000-0000-4000-8000-000000000002", allocations: null,
  };
  for (const method of ["cash", "mtn_momo", "orange_money", "bank_transfer"]) {
    assert.equal(parsePaymentInput({ ...base, method }).ok, true);
  }
  assert.equal(parsePaymentInput({ ...base, method: "cash", amountXaf: 42.5 }).ok, false);
  assert.equal(parsePaymentInput({ ...base, method: "cash", amountXaf: 0 }).ok, false);
});

test("la migration rend Payment/Allocation atomiques, idempotents et sérialisés", () => {
  assert.match(migration, /create table public\.payments/i);
  assert.match(migration, /create table public\.payment_allocations/i);
  assert.match(migration, /payments_idempotency_key unique/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /payment_allocation_exceeds_due/i);
  assert.match(migration, /PAYMENT_RECORDED[\s\S]*PAYMENT_COMPLETED/i);
});

test("reversal et historique sont compensatoires et append-only", () => {
  assert.match(migration, /create or replace function public\.reverse_payment/i);
  assert.match(migration, /entry_type, source_key[\s\S]*'payment_reversal'/i);
  assert.match(migration, /payment_history_is_append_only/i);
  assert.match(migration, /payment_allocations_no_update_delete/i);
  assert.doesNotMatch(migration, /delete from public\.(payments|payment_allocations)/i);
});
