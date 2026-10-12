import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  STRIPE_TEST_PRICE_CONTRACT,
  readStripeTestPriceMapping,
  stripeTestPriceFromMapping,
} from "../src/core/billing/stripe-price-contract.ts";
import { isStripeTestSecret, stripeReturnUrl } from "../src/core/billing/stripe-test-safety.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const adapter = read("../src/core/billing/adapters/stripe-test-adapter.ts");
const audit = read("../scripts/audit-stripe-test-catalog.ts");
const webhook = read("../src/app/api/billing/webhooks/[provider]/route.ts");
const migration = read("../supabase/migrations/20260928201745_billing_stripe_saas_01.sql");

const sixPrices = Object.fromEntries(
  STRIPE_TEST_PRICE_CONTRACT.map((entry, index) => [entry.envKey, `price_fixture_${index + 1}`]),
);

test("08 — une clé Live est refusée et seule une clé Test est admissible", () => {
  assert.equal(isStripeTestSecret("sk_test_fixture"), true);
  assert.equal(isStripeTestSecret("sk_live_fixture"), false);
  assert.match(audit, /secret\.startsWith\("sk_test_"\)/);
});

test("08 — le contrat ferme six Price IDs CAD distincts avec les montants canoniques", () => {
  assert.equal(STRIPE_TEST_PRICE_CONTRACT.length, 6);
  assert.deepEqual(
    STRIPE_TEST_PRICE_CONTRACT.map(({ amountMinor }) => amountMinor),
    [1_499, 14_990, 3_199, 31_990, 6_199, 61_990],
  );
  assert.equal(readStripeTestPriceMapping(sixPrices)?.length, 6);
  assert.equal(readStripeTestPriceMapping({ ...sixPrices, STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD: "price_fixture_1" }), null);
  assert.equal(readStripeTestPriceMapping({ ...sixPrices, STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD: "" }), null);
  assert.equal(stripeTestPriceFromMapping("decouverte", "monthly", sixPrices), null);
});

test("08 — l'audit refuse devise, montant, cadence et produits Kjemo divergents", () => {
  assert.match(audit, /price\.currency === "cad"/);
  assert.match(audit, /price\.unit_amount === entry\.amountMinor/);
  assert.match(audit, /price\.recurring\?\.interval === entry\.interval/);
  for (const product of ["Kjemo Entretien", "Essentiel", "Kjemo Croissance", "Kjemo Protection"]) {
    assert.ok(audit.includes(`"${product}"`));
  }
});

test("08 — les URL de retour restent internes à l'origine HTTPS configurée", () => {
  assert.equal(
    stripeReturnUrl("https://kjorapp.com", "/app/billing?checkout=success"),
    "https://kjorapp.com/app/billing?checkout=success",
  );
  for (const value of ["//evil.example", "/\\evil.example", "https://evil.example/path"]) {
    assert.throws(() => stripeReturnUrl("https://kjorapp.com", value));
  }
});

test("08 — signature, rejeu et événement inattendu sont fail-closed", () => {
  assert.match(adapter, /if \(!signature\) return \{ valid: false, reason: "missing_signature" \}/);
  assert.match(adapter, /Stripe\.webhooks\.constructEvent/);
  assert.match(migration, /on conflict \(provider, provider_event_id\) do nothing/);
  assert.match(migration, /ignored_duplicate/);
  assert.match(migration, /else null end;[\s\S]*if next_status is null then/);
  assert.match(migration, /disposition_reason = 'event_type_unhandled'/);
  assert.match(webhook, /return ack\(processError \? 500 : 200\)/);
});

test("08 — l'audit exige l'endpoint Test exact et uniquement les événements consommés", () => {
  assert.match(audit, /https:\/\/kjorapp\.com\/api\/billing\/webhooks\/stripe/);
  for (const event of [
    "charge.refunded",
    "checkout.session.completed",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.payment_failed",
  ]) {
    assert.ok(audit.includes(`"${event}"`));
    assert.ok(migration.includes(`'${event}'`));
  }
  assert.match(audit, /webhook\.status !== "enabled"/);
  assert.match(audit, /STRIPE_TEST_WEBHOOK_EVENTS_INVALID/);
});

test("08 — aucun secret Stripe ne traverse le client ou les journaux", () => {
  assert.doesNotMatch(audit, /console\.log\([^\n]*(secret|process\.env)/i);
  assert.match(audit, /maskedId\(matches\[0\]\.id\)/);
  assert.doesNotMatch(adapter + webhook, /NEXT_PUBLIC_[A-Z0-9_]*STRIPE/);
  assert.doesNotMatch(adapter + webhook, /console\.(log|error|warn)/);
});
