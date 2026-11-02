import assert from "node:assert/strict";
import test from "node:test";

import { applyStartDateOverrides, checkLeaseStart, countElapsedPeriods } from "../src/modules/data-import/lease-start.ts";

const today = new Date(Date.UTC(2026, 10, 2)); // 2026-11-02

test("compte les échéances mensuelles dont l'avis est passé", () => {
  // échéance le 5 : l'avis du 5 novembre est le 31 octobre -> comptée
  assert.equal(countElapsedPeriods("2026-09-01", "monthly", 5, today), 3);
  assert.equal(countElapsedPeriods("2026-11-01", "monthly", 5, today), 1);
  assert.equal(countElapsedPeriods("2027-01-01", "monthly", 5, today), 0);
});

test("détecte une dette supérieure au total des échéances", () => {
  const lease = { startDate: "2026-09-01", billingFrequency: "monthly", dueDay: 5, baseRentXaf: 50000, recurringChargesXaf: 0, openingSituation: { kind: "debt", amountXaf: 200000 }, securityDepositXaf: 0, depositSituation: { status: "not_required", paidAmountXaf: 0 } } as never;
  assert.equal(checkLeaseStart(lease, "2026-09-01", today).debtExceeds, true);
  assert.equal(checkLeaseStart(lease, "2026-06-01", today).debtExceeds, false);
});

test("applique les dates corrigées sans modifier les autres lignes", () => {
  const rows = [{ rowNumber: 2, row: { lease: { startDate: "2026-09-01" } } }, { rowNumber: 3, row: { lease: { startDate: "2026-10-01" } } }] as never[];
  const out = applyStartDateOverrides(rows, new Map([[2, "2026-03-01"]])) as unknown as { row: { lease: { startDate: string } } }[];
  assert.equal(out[0].row.lease.startDate, "2026-03-01");
  assert.equal(out[1].row.lease.startDate, "2026-10-01");
});
