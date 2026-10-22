import assert from "node:assert/strict";
import test from "node:test";
import { stripeInvoicePeriod } from "../src/core/billing/stripe-webhook-data.ts";

test("Stripe invoice period uses top-level timestamps when present", () => {
  assert.deepEqual(stripeInvoicePeriod({ period_start: 1_700_000_000, period_end: 1_700_086_400 }), {
    start: "2023-11-14T22:13:20.000Z", end: "2023-11-15T22:13:20.000Z",
  });
});

test("Stripe invoice period safely falls back to the subscription line", () => {
  assert.deepEqual(stripeInvoicePeriod({ lines: { data: [
    { type: "invoiceitem", period: { start: 1, end: 2 } },
    { type: "subscription", period: { start: 1_700_000_000, end: 1_702_678_400 } },
  ] } }), {
    start: "2023-11-14T22:13:20.000Z", end: "2023-12-15T22:13:20.000Z",
  });
});

test("Stripe invoice period does not invent a missing or malformed period", () => {
  assert.deepEqual(stripeInvoicePeriod({ lines: { data: [{ type: "subscription", period: { start: "bad", end: 0 } }] } }), {
    start: null, end: null,
  });
});
