import assert from "node:assert/strict";
import test from "node:test";

import { countByFilter, daysLate, groupByMonth, matchesFilter, matchesSearch, monthLabel, sortRows, summarize, type DueOverviewRow } from "../src/modules/finance/overview.ts";

const row = (over: Partial<DueOverviewRow>): DueOverviewRow => ({
  dueId: "d", leaseId: "l", tenantId: "t", tenantName: "Alice Ayissi", unitLabel: "E1", propertyName: "Central Bar", reference: "DUE-1",
  kind: "periodic", dueDate: "2026-11-01", periodStart: "2026-11-01", periodEnd: "2026-11-30", noticeDate: "2026-10-27",
  totalXaf: 30000, paidXaf: 0, remainingXaf: 30000, status: "overdue", phone: null, email: null, ...over,
});

test("filtres et compteurs", () => {
  const rows = [row({}), row({ status: "due" }), row({ status: "partially_paid" }), row({ status: "paid", remainingXaf: 0 }), row({ status: "upcoming" })];
  assert.deepEqual(countByFilter(rows), { all: 5, overdue: 1, due: 2, upcoming: 1, settled: 1 });
  assert.equal(matchesFilter({ status: "covered" }, "settled"), true);
});

test("totaux ignorent les échéances annulées", () => {
  const totals = summarize([row({}), row({ status: "paid", paidXaf: 30000, remainingXaf: 0 }), row({ status: "cancelled", totalXaf: 99999, remainingXaf: 99999 })]);
  assert.deepEqual(totals, { expectedXaf: 60000, receivedXaf: 30000, remainingXaf: 30000, overdueXaf: 30000, overdueCount: 1 });
});

test("jours de retard", () => {
  assert.equal(daysLate(row({}), "2026-11-10"), 9);
  assert.equal(daysLate(row({ status: "paid", remainingXaf: 0 }), "2026-11-10"), 0);
  assert.equal(daysLate(row({ dueDate: "2026-11-20" }), "2026-11-10"), 0);
});

test("regroupement par mois, récents d'abord, retards en tête", () => {
  const groups = groupByMonth([row({ dueDate: "2026-10-01" }), row({ dueDate: "2026-11-01" })]);
  assert.deepEqual(groups.map((group) => group.key), ["2026-11", "2026-10"]);
  assert.equal(monthLabel("2026-11"), "Novembre 2026");
  const sorted = sortRows([row({ status: "paid", tenantName: "Z" }), row({ status: "due", tenantName: "B" }), row({ status: "overdue", tenantName: "A" })]);
  assert.deepEqual(sorted.map((item) => item.status), ["overdue", "due", "paid"]);
});

test("recherche", () => {
  assert.equal(matchesSearch(row({}), "ayissi"), true);
  assert.equal(matchesSearch(row({}), "zzz"), false);
  assert.equal(matchesSearch(row({}), "  "), true);
});
