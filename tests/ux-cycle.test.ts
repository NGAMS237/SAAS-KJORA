import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { leaseClosingSummary } from "../src/modules/tenancy/closing.ts";

const due = (over: Record<string, unknown>) => ({ kind: "periodic", status: "paid", dueDate: "2026-09-05", periodStart: "2026-09-01", periodEnd: "2026-09-30", remainingXaf: 0, depositXaf: 0, paymentAllocatedXaf: 0, ...over });

test("solde de tout compte : reste dû, dépôt versé, crédit", () => {
  const summary = leaseClosingSummary([
    due({}),
    due({ status: "upcoming", periodStart: "2026-11-01", periodEnd: "2026-11-30", remainingXaf: 16000 }),
    due({ kind: "deposit", status: "paid", paymentAllocatedXaf: 50000, depositXaf: 50000 }),
    due({ status: "cancelled", remainingXaf: 32000 }),
  ], 0);
  assert.equal(summary.rentRemainingXaf, 16000);
  assert.equal(summary.depositHeldXaf, 50000);
  assert.equal(summary.netXaf, -34000); // 34 000 à rembourser avant retenues
  assert.equal(summary.openPeriods.length, 1);
});

test("les échéances en retard et nouvelles sont mises en évidence", () => {
  const views = readFileSync("src/modules/finance/views.tsx", "utf8");
  assert.match(views, /financial-table__row--\$\{tone\}/);
  assert.match(views, /jour\(s\) de retard/);
  assert.match(views, /Nouvelle échéance/);
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\.financial-table__row--overdue/);
  assert.match(css, /\.financial-table__row--fresh/);
});

test("le formulaire de bail n'impose plus le premier locataire de la liste", () => {
  const views = readFileSync("src/modules/tenancy/views.tsx", "utf8");
  assert.match(views, /Choisir un locataire…/);
  assert.doesNotMatch(views, /options\.tenants\[0\]\?\.id/);
});
