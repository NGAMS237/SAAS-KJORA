import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260928201745_billing_stripe_saas_01.sql");
const adapter = read("../src/core/billing/adapters/stripe-test-adapter.ts");
const config = read("../src/core/billing/provider-config.ts");
const prices = read("../src/core/billing/stripe-price-map.ts");
const webhook = read("../src/app/api/billing/webhooks/[provider]/route.ts");
const env = read("../.env.example");

test("Stripe Test reste désactivé par défaut et refuse les clés live", () => {
  assert.match(config, /BILLING_PROVIDER_STRIPE_TEST_ENABLED !== "1"/);
  assert.match(env, /BILLING_PROVIDER_STRIPE_TEST_ENABLED=0/);
  assert.match(adapter, /secret\.startsWith\("sk_test_"\)/);
  assert.doesNotMatch(adapter.replace(/\/\/.*$/gm, ""), /sk_live_[A-Za-z0-9]/);
});

test("le mapping Price ID est fermé par plan, cycle et CAD", () => {
  for (const plan of ["ESSENTIEL", "AVANCE", "PATRIMOINE"]) {
    assert.match(prices, new RegExp(`STRIPE_TEST_PRICE_${plan}_MONTHLY_CAD`));
    assert.match(prices, new RegExp(`STRIPE_TEST_PRICE_${plan}_ANNUAL_CAD`));
  }
  assert.match(prices, /value\?\.startsWith\("price_"\)/);
});

test("Checkout et Portal passent uniquement par le SDK serveur", () => {
  assert.match(adapter, /stripe\.checkout\.sessions\.create/);
  assert.match(adapter, /stripe\.billingPortal\.sessions\.create/);
  assert.match(adapter, /idempotencyKey: request\.idempotencyKey/);
  assert.match(adapter, /session\.livemode/);
});

test("le webhook signé brut est la seule voie d'activation payante", () => {
  assert.match(adapter, /Stripe\.webhooks\.constructEvent\(rawBody, signature, webhookSecret\)/);
  assert.match(webhook, /process_stripe_test_event/);
  assert.match(migration, /p_event_type = 'checkout\.session\.completed' and p_payment_status = 'paid'/);
  assert.match(migration, /perform private\.assign_organization_plan/);
});

test("rejeux et événements hors ordre sont neutralisés", () => {
  assert.match(migration, /unique \(organization_id, provider, idempotency_key\)/);
  assert.match(migration, /p_event_created_at < intent\.last_provider_event_created_at/);
  assert.match(migration, /ignored_out_of_order/);
});

test("la migration Stripe ne touche aucune table de loyers", () => {
  const code = migration.replace(/--.*$/gm, "");
  for (const table of ["payments", "dues", "ledger_entries", "financial_documents", "tenants"]) {
    assert.doesNotMatch(code, new RegExp(`public\\.${table}\\b`));
  }
});
