import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261030220000_stripe_live_invoice_payment_sync.sql");
const webhook = read("../src/app/api/billing/webhooks/[provider]/route.ts");

test("paid provider invoice creates one idempotent local payment attempt", () => {
  assert.match(migration, /insert into public\.billing_payment_attempts/);
  assert.match(migration, /stripe:' \|\| provider_mode \|\| ':invoice:' \|\| new\.provider_invoice_ref/);
  assert.match(migration, /on conflict \(organization_id, idempotency_key\) do update/);
  assert.match(migration, /billing_provider_paid_invoice_sync/);
});

test("provider invoice sync preserves Live/Test separation and never reactivates a plan", () => {
  assert.match(migration, /STRIPE-LIVE-/);
  assert.match(migration, /STRIPE-TEST-/);
  assert.doesNotMatch(migration, /assign_organization_plan/);
  assert.doesNotMatch(migration, /rent_payments|rent_due_items/);
});

test("invoice period fills the subscription period and renewal without a second charge", () => {
  assert.match(migration, /current_period_start = new\.period_start/);
  assert.match(migration, /current_period_end = new\.period_end/);
  assert.match(migration, /renewal_date = case when status = 'cancellation_scheduled'/);
  assert.match(webhook, /verification\.eventType\.startsWith\("invoice\."\) \? invoicePeriod\.end/);
  assert.doesNotMatch(migration + webhook, /checkout\.sessions\.create|paymentIntents\.create/);
});
