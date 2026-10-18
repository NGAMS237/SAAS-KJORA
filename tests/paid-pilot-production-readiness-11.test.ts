import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STRIPE_LIVE_PRICE_CONTRACT,
  STRIPE_TEST_PRICE_CONTRACT,
  readStripePriceMapping,
} from "../src/core/billing/stripe-price-contract.ts";
import { isStripeLiveSecret, isStripePublishableKey, isStripeTestSecret } from "../src/core/billing/stripe-test-safety.ts";
import { billingTransactionalCopy } from "../src/core/billing/transactional-copy.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const config = read("../src/core/billing/provider-config.ts");
const checkout = read("../src/app/api/billing/stripe/checkout/route.ts");
const webhook = read("../src/app/api/billing/webhooks/[provider]/route.ts");
const adapter = read("../src/core/billing/adapters/stripe-test-adapter.ts");
const migration = read("../supabase/migrations/20261017120000_paid_pilot_production_readiness_11.sql");
const adminServer = read("../src/modules/platform-admin/server.ts");
const adminView = read("../src/modules/platform-admin/views.tsx");
const liveAudit = read("../scripts/audit-stripe-live-catalog.ts");
const liveConfigure = read("../scripts/configure-stripe-live-catalog.ts");
const terms = read("../src/app/conditions-abonnement/page.tsx");
const footer = read("../src/core/ui/public-footer.tsx");

function mapping(contract: typeof STRIPE_TEST_PRICE_CONTRACT, prefix: string) {
  return Object.fromEntries(contract.map((entry, index) => [entry.envKey, `price_${prefix}_${index}`]));
}

test("11 — catalogues Test et Live ont six prix CAD distincts et séparés", () => {
  assert.equal(STRIPE_TEST_PRICE_CONTRACT.length, 6);
  assert.equal(STRIPE_LIVE_PRICE_CONTRACT.length, 6);
  assert.deepEqual(STRIPE_LIVE_PRICE_CONTRACT.map((x) => x.amountMinor), [1499,14990,3199,31990,6199,61990]);
  const testMapping = mapping(STRIPE_TEST_PRICE_CONTRACT, "test");
  const liveMapping = mapping(STRIPE_LIVE_PRICE_CONTRACT, "live");
  assert.equal(readStripePriceMapping("test", testMapping)?.length, 6);
  assert.equal(readStripePriceMapping("live", liveMapping)?.length, 6);
  assert.equal(readStripePriceMapping("live", testMapping), null);
});

test("11 — clés Stripe Test/Live strictement distinguées", () => {
  assert.equal(isStripeTestSecret("sk_test_fixture"), true);
  assert.equal(isStripeTestSecret("sk_live_fixture"), false);
  assert.equal(isStripeLiveSecret("sk_live_fixture"), true);
  assert.equal(isStripeLiveSecret("sk_test_fixture"), false);
  assert.equal(isStripePublishableKey("pk_live_fixture", "live"), true);
  assert.equal(isStripePublishableKey("pk_test_fixture", "live"), false);
});

test("11 — activation Live exige pilote, invitation et drapeau fournisseur, sans coexistence Test", () => {
  for (const token of ["KJORA_PAID_PILOT_ENABLED", "KJORA_PAID_PILOT_INVITE_ONLY", "BILLING_PROVIDER_STRIPE_LIVE_ENABLED"]) {
    assert.ok(config.includes(token));
  }
  assert.match(config, /if \(testEnabled === liveEnabled\) return null/);
  assert.match(config, /BILLING_KILL_SWITCH_STRIPE_LIVE/);
  assert.match(config, /isStripeLiveSecret\(secret\)/);
  assert.match(config, /isStripePublishableKey\(publishable, "live"\)/);
});

test("11 — Checkout ne fait confiance ni au prix, ni au pays, ni à l'Organization du client", () => {
  assert.match(checkout, /authorization\.organizationId/);
  assert.match(checkout, /stripePrice\(environment, body\.plan, body\.cycle\)/);
  assert.match(checkout, /requestPlanChange\(authorization\.organizationId, body\.plan, body\.cycle, "CA"\)/);
  assert.doesNotMatch(checkout, /body\.(amount|amountMinor|price|priceRef|currency|country|organizationId)/);
  assert.match(migration, /sub\.billing_country <> 'CA' or sub\.currency <> 'CAD'/);
  assert.match(migration, /sub\.pending_amount_minor is distinct from amount/);
});

test("11 — le pilote Live est limité à l'Owner invité et à billing.manage", () => {
  assert.match(migration, /m\.role = 'organization_owner'/);
  assert.match(migration, /private\.has_capability\(target_organization_id, 'billing\.manage'\)/);
  assert.match(migration, /public\.paid_pilot_access a[\s\S]*a\.status = 'active'/);
  assert.match(migration, /perform private\.assert_platform_admin\(\)/);
  assert.match(migration, /revoke all on public\.paid_pilot_access from public, anon, authenticated/);
});

test("11 — webhooks validés par environnement, idempotents et service_role seulement", () => {
  assert.match(adapter, /event\.livemode !== live/);
  assert.match(adapter, /cs_test_|cs_live_/);
  assert.match(migration, /on conflict \(provider, provider_event_id\) do nothing/);
  assert.match(migration, /ignored_duplicate/);
  assert.match(migration, /event_out_of_order/);
  assert.match(migration, /current_setting\('request\.jwt\.claims'/);
  assert.match(migration, /grant execute on function public\.process_stripe_event_v2[\s\S]*to service_role/);
});

test("11 — paiement vérifié synchronise une facture SaaS sans écrire dans les loyers", () => {
  assert.match(migration, /insert into public\.billing_invoices/);
  assert.match(migration, /generation_source[\s\S]*'provider'/);
  assert.match(migration, /provider_invoice_ref/);
  assert.match(migration, /p_invoice_amount_minor <> intent\.expected_amount_minor/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(rent_payments|rent_due_items|leases|lease_contracts)/i);
  assert.match(webhook, /object\.amount_paid/);
  assert.match(webhook, /object\.amount_due/);
  assert.match(webhook, /object\.invoice/);
  assert.match(webhook, /parentSubscription/);
  assert.match(migration, /bi\.provider_invoice_ref = p_invoice_ref/);
});

test("11 — échec, action requise et résiliation ne créent aucun droit payant indu", () => {
  assert.match(migration, /invoice\.payment_failed/);
  assert.match(migration, /invoice\.payment_action_required/);
  assert.match(migration, /perform private\.assign_organization_plan\(intent\.organization_id, 'decouverte'\)/);
  assert.match(migration, /if next_status = 'paid' then/);
  assert.match(migration, /elsif next_status = 'payment_failed' then/);
});

test("11 — factures et état opérationnel ne publient pas les références Stripe", () => {
  assert.match(migration, /last_payment_state/);
  assert.match(migration, /last_webhook_disposition/);
  assert.doesNotMatch(adminServer + adminView, /provider_(customer|subscription|invoice)_ref/);
  assert.doesNotMatch(adminServer + adminView, /payment_method_last4/);
  assert.match(adminView, /row\.lastWebhookEvent/);
});

test("11 — audit Live est lecture seule et configuration Live exige une approbation exacte", () => {
  assert.match(liveAudit, /sk_live_/);
  assert.match(liveAudit, /https:\/\/kjorapp\.com\/api\/billing\/webhooks\/stripe/);
  assert.doesNotMatch(liveAudit, /\.create\(|\.update\(|\.del\(/);
  assert.match(liveConfigure, /KJORA_STRIPE_LIVE_CATALOG_CHANGE_APPROVED/);
  assert.match(liveConfigure, /YES_I_APPROVE_STRIPE_LIVE_CHANGES/);
  assert.doesNotMatch(liveConfigure, /webhookEndpoints\.create/);
});

test("11 — six messages transactionnels FR/EN restent purs et sans donnée carte", () => {
  const context = { organizationName: "Organization pilote", plan: "essentiel" as const, cycle: "annual" as const };
  for (const event of ["pilot_invitation","subscription_activated","payment_received","payment_failed","payment_action_required","cancellation_scheduled","subscription_cancelled"] as const) {
    for (const locale of ["fr","en"] as const) {
      const message = billingTransactionalCopy(event, locale, context);
      assert.ok(message.subject && message.heading && message.body);
      assert.doesNotMatch(JSON.stringify(message), /card|carte|last4|secret|customer_ref/i);
    }
  }
});

test("11 — le catalogue de webhooks couvre le cycle complet supervisé", () => {
  for (const event of [
    "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
    "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed",
    "invoice.payment_action_required", "charge.refunded",
  ]) {
    assert.ok(webhook.includes(event) || migration.includes(`'${event}'`));
    assert.ok(liveAudit.includes(`"${event}"`));
  }
});

test("11 — conditions pilote FR/EN visibles sans prétendre que Live est actif", () => {
  assert.match(footer, /conditions-abonnement/);
  assert.match(terms, /Pilote payant privé/);
  assert.match(terms, /Private paid pilot/);
  assert.match(terms, /À VALIDER PAR BLAISE/);
  assert.match(terms, /not a claim that Live payments are enabled/);
});
