import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { earliestRentChangeDate } from "../src/modules/tenancy/rent-dates.ts";

const today = new Date(Date.UTC(2026, 10, 2));

test("premier jour possible : lendemain de la dernière échéance émise", () => {
  const dues = [
    { periodEnd: "2026-10-31", status: "paid" },
    { periodEnd: "2026-11-30", status: "upcoming" },
  ];
  assert.equal(earliestRentChangeDate(dues, today), "2026-12-01");
});

test("sans échéance, jamais avant demain ; dépôt et ajustements ignorés", () => {
  assert.equal(earliestRentChangeDate([], today), "2026-11-03");
  assert.equal(earliestRentChangeDate([{ periodEnd: "2027-01-31", status: "open", kind: "deposit" }], today), "2026-11-03");
});

test("la route appelle la fonction SQL existante et refuse sans lease.manage", () => {
  const route = readFileSync("src/app/api/tenancy/route.ts", "utf8");
  assert.match(route, /schedule_lease_financial_terms/);
  assert.match(route, /future_period_already_generated/);
  assert.match(route, /const requiredCapability = action\.includes\("tenant"\) \? "tenant\.manage" : "lease\.manage"/);
});
