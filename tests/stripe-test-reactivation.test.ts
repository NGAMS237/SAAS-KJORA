import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261015195207_stripe_test_reactivation_new_cycle.sql");
const checkout = read("../src/app/api/billing/stripe/checkout/route.ts");

test("Stripe Test reactivation accepts the unchanged effective plan only through the guarded RPC", () => {
  assert.match(checkout, /\["upgrade_intent_recorded", "unchanged"\]/);
  assert.match(checkout, /prepare_stripe_test_checkout/);
  assert.match(migration, /if sub\.status = 'reactivation_pending' then/);
  assert.match(migration, /private\.has_capability\(target_organization_id, 'billing\.manage'\)/);
});

test("reactivation atomically replaces the stale intent with the full CAD catalog amount", () => {
  assert.match(migration, /where organization_id = target_organization_id for update/);
  assert.match(migration, /select amount_minor into amount from public\.billing_prices/);
  assert.match(migration, /pending_plan = p_plan[\s\S]*pending_cycle = p_cycle[\s\S]*pending_amount_minor = amount/);
  assert.doesNotMatch(migration, /amount_minor\s*[:=]\s*p_/i);
});

test("normal upgrades remain fail-closed on intent and amount mismatches", () => {
  assert.match(migration, /elsif sub\.pending_plan is distinct from p_plan[\s\S]*pending_intent_mismatch/);
  assert.match(migration, /elsif sub\.pending_amount_minor is distinct from amount[\s\S]*catalog_amount_mismatch/);
  assert.match(migration, /p_plan not in \('essentiel','avance','patrimoine'\)/);
  assert.match(migration, /sub\.billing_country <> 'CA' or sub\.currency <> 'CAD'/);
});

test("the RPC remains isolated, authenticated and does not activate an entitlement", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function public\.prepare_stripe_test_checkout[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.prepare_stripe_test_checkout[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /update\s+public\.organization_plans|set[\s\S]{0,120}status\s*=\s*'active'|assign_organization_plan/i);
});
