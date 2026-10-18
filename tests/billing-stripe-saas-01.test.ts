import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260928201745_billing_stripe_saas_01.sql");
const pilotMigration = read("../supabase/migrations/20261017120000_paid_pilot_production_readiness_11.sql");
const adapter = read("../src/core/billing/adapters/stripe-test-adapter.ts");
const config = read("../src/core/billing/provider-config.ts");
const prices = read("../src/core/billing/stripe-price-map.ts");
const priceContract = read("../src/core/billing/stripe-price-contract.ts");
const webhook = read("../src/app/api/billing/webhooks/[provider]/route.ts");
const env = read("../.env.example");

test("Stripe Test reste désactivé par défaut et refuse les clés live", () => {
  assert.match(config, /const testEnabled = env\.BILLING_PROVIDER_STRIPE_TEST_ENABLED === "1"/);
  assert.match(config, /if \(testEnabled === liveEnabled\) return null/);
  assert.match(env, /BILLING_PROVIDER_STRIPE_TEST_ENABLED=0/);
  assert.match(adapter, /live \? !secret\.startsWith\("sk_live_"\) : !secret\.startsWith\("sk_test_"\)/);
});

test("le mapping Price ID est fermé par plan, cycle et CAD", () => {
  for (const plan of ["ESSENTIEL", "AVANCE", "PATRIMOINE"]) {
    assert.match(priceContract, new RegExp(`STRIPE_TEST_PRICE_${plan}_MONTHLY_CAD`));
    assert.match(priceContract, new RegExp(`STRIPE_TEST_PRICE_${plan}_ANNUAL_CAD`));
  }
  assert.match(priceContract, /priceId\.startsWith\("price_"\)/);
  assert.match(prices, /readStripeTestPriceMapping/);
});

test("Checkout et Portal passent uniquement par le SDK serveur", () => {
  assert.match(adapter, /stripe\.checkout\.sessions\.create/);
  assert.match(adapter, /stripe\.billingPortal\.sessions\.create/);
  assert.match(adapter, /idempotencyKey: request\.idempotencyKey/);
  assert.match(adapter, /session\.livemode/);
});

test("le webhook signé brut est la seule voie d'activation payante", () => {
  assert.match(adapter, /Stripe\.webhooks\.constructEvent\(rawBody, signature, webhookSecret\)/);
  assert.match(webhook, /process_stripe_event_v2/);
  assert.match(pilotMigration, /p_event_type in \('checkout\.session\.completed','invoice\.paid'\) and p_payment_status = 'paid'/);
  assert.match(pilotMigration, /perform private\.assign_organization_plan/);
});

test("rejeux et événements hors ordre sont neutralisés", () => {
  assert.match(migration, /unique \(organization_id, provider, idempotency_key\)/);
  assert.match(migration, /insert into public\.billing_webhook_events[\s\S]*on conflict \(provider, provider_event_id\) do nothing/);
  assert.match(migration, /return jsonb_build_object\('outcome','ignored_duplicate'\)/);
  assert.doesNotMatch(webhook, /provider === "stripe"[\s\S]*\.from\("billing_webhook_events"\)\.insert/);
  assert.match(migration, /p_event_created_at < intent\.last_provider_event_created_at/);
  assert.match(migration, /ignored_out_of_order/);
});

test("les mises à jour Stripe distinguent activation, échec, annulation programmée et annulation", () => {
  assert.match(migration, /p_cancel_at_period_end then 'cancellation_scheduled'/);
  assert.match(migration, /p_provider_status in \('past_due','unpaid'\) then 'payment_failed'/);
  assert.match(migration, /p_provider_status in \('active','trialing'\)/);
  assert.match(migration, /p_current_period_end::date/);
  assert.doesNotMatch(migration, /customer\.subscription\.updated' then 'grace'/);
});

test("la migration Stripe ne touche aucune table de loyers", () => {
  const code = migration.replace(/--.*$/gm, "");
  for (const table of ["payments", "dues", "ledger_entries", "financial_documents", "tenants"]) {
    assert.doesNotMatch(code, new RegExp(`public\\.${table}\\b`));
  }
});
