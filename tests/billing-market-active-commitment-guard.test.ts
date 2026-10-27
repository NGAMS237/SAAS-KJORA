import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261026120000_billing_market_active_commitment_guard.sql");
const billingView = read("../src/core/billing/billing-view.tsx");
const checkoutRoute = read("../src/app/api/billing/stripe/checkout/route.ts");

test("historical audit rows do not block a free market change", () => {
  assert.doesNotMatch(migration, /not exists\s*\(\s*select 1 from public\.billing_events/i);
  assert.match(migration, /commercial_interventions ci[\s\S]*ci\.status = 'active'/);
  assert.match(migration, /ci\.ends_on is null or ci\.ends_on >= current_date/);
});

test("a pending XAF request, active subscription, checkout, provider payment, or refund blocks the market", () => {
  for (const blocker of [
    "active_subscription",
    "active_plan_change",
    "open_checkout",
    "provider_payment_in_progress",
    "refund_review_required",
  ]) assert.match(migration, new RegExp(`'${blocker}'`));
  assert.match(migration, /pi\.status in \('prepared','checkout_open'\)/);
  assert.match(migration, /i\.generation_source = 'provider'/);
});

test("the refusal is precise and is not represented as missing Stripe configuration", () => {
  assert.match(migration, /'outcome','billing_market_change_blocked'/);
  assert.match(migration, /'blockers',blockers/);
  assert.match(checkoutRoute, /billing_market_change_blocked/);
  assert.match(billingView, /engagement financier actif|active financial commitment/i);
  assert.doesNotMatch(billingView, /billing_market_change_blocked[\s\S]{0,280}Stripe n’est pas disponible/i);
});

test("billing keeps a persistent accessible explanation and prevents Checkout after a market refusal", () => {
  assert.match(billingView, /sessionStorage\.setItem\("kjora\.billing\.notice"/);
  assert.match(billingView, /role=\{notice\.kind === "error" \? "alert" : "status"\}/);
  assert.match(billingView, /active_commercial_intervention/);
  assert.match(billingView, /disabled=\{busy \|\| marketChangeBlocked \|\| !affordance\.online\}/);
  assert.match(billingView, /pilot_not_eligible/);
  assert.match(billingView, /stripe_unavailable/);
  assert.match(billingView, /erreur technique|technical error/i);
  assert.match(billingView, /affordance\.online[\s\S]{0,260}poursuivre vers Stripe/);
});

test("a successful Canada market change continues through the canonical plan request and CAD catalog", () => {
  assert.match(migration, /set billing_country = target_billing_country,[\s\S]*currency = target_currency/);
  assert.match(migration, /result := public\.request_plan_change\(target_organization_id,target_plan,target_cycle\)/);
  assert.match(migration, /when 'CA' then 'CAD'/);
});
