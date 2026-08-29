import assert from "node:assert/strict";
import test from "node:test";
import { buildDueSchedule, deriveLedgerPosition, dueBreakdown, dueDateForPeriod, financialBalanceLabel } from "../src/modules/finance/model.ts";

const base = {
  leaseStart: "2026-09-01",
  effectiveEnd: null,
  billingFrequency: "monthly" as const,
  baseRentXaf: 40_000,
  recurringChargesXaf: 2_000,
  dueDay: 5,
  generateDaysBefore: 5,
  entryProrationMode: "none" as const,
  exitProrationMode: "none" as const,
};

test("monthly generation keeps rent and charges separate and computes J-5 by calendar days", () => {
  const [due] = buildDueSchedule(base, "2026-08-31");
  assert.deepEqual(due, {
    periodStart: "2026-09-01", periodEnd: "2026-09-30",
    scheduledPeriodStart: "2026-09-01", scheduledPeriodEnd: "2026-09-30",
    dueDate: "2026-09-05", noticeDate: "2026-08-31",
    rentXaf: 40_000, chargesXaf: 2_000, totalXaf: 42_000,
    isEntryProrata: false, isExitProrata: false, occupiedDays: 30, daysInPeriod: 30,
  });
});

test("quarterly, semiannual and annual schedules advance by their real period", () => {
  for (const [frequency, expectedEnd] of [["quarterly", "2026-11-30"], ["semiannual", "2027-02-28"], ["annual", "2027-08-31"]] as const) {
    const [due] = buildDueSchedule({ ...base, billingFrequency: frequency }, "2026-08-31");
    assert.equal(due?.periodEnd, expectedEnd);
  }
});

test("due day is bounded to the last valid day for short months", () => {
  assert.equal(dueDateForPeriod("2028-02-01", 31), "2028-02-29");
  assert.equal(dueDateForPeriod("2027-02-01", 31), "2027-02-28");
});

test("entry prorata uses inclusive calendar days for rent and recurring charges", () => {
  const [due] = buildDueSchedule({ ...base, leaseStart: "2026-03-20", entryProrationMode: "calendar_days" }, "2026-03-20");
  assert.equal(due?.occupiedDays, 12);
  assert.equal(due?.daysInPeriod, 31);
  assert.equal(due?.rentXaf, 15_484);
  assert.equal(due?.chargesXaf, 774);
  assert.equal(due?.totalXaf, 16_258);
  assert.equal(due?.dueDate, "2026-03-20");
});

test("exit prorata clips the last period and never creates a future period", () => {
  const dues = buildDueSchedule({ ...base, effectiveEnd: "2026-10-12", exitProrationMode: "calendar_days" }, "2027-01-01");
  assert.equal(dues.length, 2);
  assert.equal(dues[1]?.periodEnd, "2026-10-12");
  assert.equal(dues[1]?.occupiedDays, 12);
  assert.equal(dues[1]?.daysInPeriod, 31);
  assert.equal(dues[1]?.totalXaf, 16_258);
});

test("opening credit covers periods without fabricating paid statuses", () => {
  const dues = [
    { id: "1", periodStart: "2026-09-01", periodEnd: "2026-09-30", dueDate: "2026-09-05", amountXaf: 42_000, kind: "periodic" as const },
    { id: "2", periodStart: "2026-10-01", periodEnd: "2026-10-31", dueDate: "2026-10-05", amountXaf: 42_000, kind: "periodic" as const },
  ];
  const zero = deriveLedgerPosition(dues.slice(0, 1), 0, "2026-09-05");
  assert.equal(zero.amountDueXaf, 42_000);
  assert.equal(zero.dues[0]?.status, "due");

  const exact = deriveLedgerPosition(dues, 84_000, "2026-10-05");
  assert.equal(exact.coveredPeriods, 2);
  assert.equal(exact.balanceXaf, 0);
  assert.ok(exact.dues.every((due) => due.status === "covered"));

  const remainder = deriveLedgerPosition(dues, 90_000, "2026-10-05");
  assert.equal(remainder.coveredPeriods, 2);
  assert.equal(remainder.creditXaf, 6_000);
  assert.equal(remainder.lastCoveredPeriodEnd, "2026-10-31");
});

test("balance labels never expose an ambiguous signed amount", () => {
  assert.deepEqual(financialBalanceLabel(-55_000), { state: "due", amountXaf: 55_000 });
  assert.deepEqual(financialBalanceLabel(20_000), { state: "credit", amountXaf: 20_000 });
  assert.deepEqual(financialBalanceLabel(0), { state: "current", amountXaf: 0 });
});

test("a Due breakdown uses the exact server projection for credit plus a partial Payment", () => {
  assert.deepEqual(dueBreakdown({
    netExpectedXaf: 52_000,
    coveredXaf: 30_000,
    coveredByPaymentCreditXaf: 7_994,
    paymentAllocatedXaf: 10_000,
    remainingXaf: 4_006,
  }), {
    totalXaf: 52_000,
    creditAppliedXaf: 37_994,
    paymentsReceivedXaf: 10_000,
    remainingXaf: 4_006,
    reconciles: true,
  });
});
