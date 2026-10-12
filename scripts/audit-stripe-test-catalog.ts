import Stripe from "stripe";
import {
  STRIPE_TEST_PRICE_CONTRACT,
  readStripeTestPriceMapping,
} from "../src/core/billing/stripe-price-contract.ts";

class StripeAuditError extends Error {
  readonly details: Record<string, unknown>;

  constructor(
    reason: string,
    details: Record<string, unknown> = {},
  ) {
    super(reason);
    this.details = details;
  }
}

function safeFailure(error: unknown): Record<string, unknown> {
  if (error instanceof StripeAuditError) {
    return { status: "FAIL", reason: error.message, ...error.details };
  }
  if (error instanceof Error && /^STRIPE_[A-Z0-9_]+(?::[A-Za-z0-9_ -]+)?$/.test(error.message)) {
    return { status: "FAIL", reason: error.message };
  }
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    status: "FAIL",
    reason: "STRIPE_API_ERROR",
    type: typeof candidate.type === "string" ? candidate.type : "unknown",
    code: typeof candidate.code === "string" ? candidate.code : "unknown",
  };
}

async function main() {
const secret = process.env.STRIPE_SANDBOX_SECRET_KEY?.trim() ?? "";
if (!secret.startsWith("sk_test_")) {
  throw new Error("STRIPE_TEST_KEY_REQUIRED");
}

const forbiddenProductNames = new Set([
  "Kjemo Entretien",
  "Essentiel",
  "Kjemo Croissance",
  "Kjemo Protection",
]);
const expectedWebhookUrl = "https://kjorapp.com/api/billing/webhooks/stripe";
const expectedWebhookEvents = [
  "charge.refunded",
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
] as const;

function maskedId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : "masked";
}

const stripe = new Stripe(secret);
const productList = await stripe.products.list({ active: true, limit: 100 });
const discovered: Record<string, string> = {};
const results: Array<Record<string, unknown>> = [];
const catalogIssues: Array<Record<string, unknown>> = [];

for (const productName of new Set(STRIPE_TEST_PRICE_CONTRACT.map(({ productName }) => productName))) {
  if (forbiddenProductNames.has(productName)) throw new Error("STRIPE_FORBIDDEN_PRODUCT");
  const products = productList.data.filter((product) => product.name === productName && !product.livemode);
  if (products.length !== 1) {
    catalogIssues.push({ reason: "STRIPE_PRODUCT_COUNT_INVALID", product: productName, observedCount: products.length });
    continue;
  }
  const product = products[0];
  const expected = STRIPE_TEST_PRICE_CONTRACT.filter((entry) => entry.productName === productName);
  const priceList = await stripe.prices.list({ active: true, product: product.id, type: "recurring", limit: 100 });
  const activeCad = priceList.data.filter((price) => !price.livemode && price.currency === "cad" && price.recurring);
  if (activeCad.length !== expected.length) {
    catalogIssues.push({
      reason: "STRIPE_PRICE_COUNT_INVALID",
      product: productName,
      expectedCount: expected.length,
      observedCount: activeCad.length,
    });
  }

  for (const entry of expected) {
    const matches = activeCad.filter((price) =>
      price.unit_amount === entry.amountMinor
      && price.recurring?.interval === entry.interval
      && price.recurring.interval_count === 1
    );
    if (matches.length !== 1) {
      catalogIssues.push({
        reason: "STRIPE_PRICE_CONTRACT_INVALID",
        envKey: entry.envKey,
        product: entry.productName,
        expected: {
          currency: "CAD",
          amountMinor: entry.amountMinor,
          interval: entry.interval,
          intervalCount: 1,
        },
        observed: activeCad.map((price) => ({
          currency: price.currency.toUpperCase(),
          amountMinor: price.unit_amount,
          interval: price.recurring?.interval,
          intervalCount: price.recurring?.interval_count,
          priceId: maskedId(price.id),
        })),
      });
      continue;
    }
    discovered[entry.envKey] = matches[0].id;
    results.push({
      envKey: entry.envKey,
      product: entry.productName,
      currency: "CAD",
      cycle: entry.cycle,
      amountMinor: entry.amountMinor,
      priceId: maskedId(matches[0].id),
      status: "PASS",
    });
  }
}

const mapping = readStripeTestPriceMapping(discovered);
if (!mapping || mapping.length !== STRIPE_TEST_PRICE_CONTRACT.length) {
  catalogIssues.push({
    reason: "STRIPE_PRICE_MAPPING_INVALID",
    expectedCount: STRIPE_TEST_PRICE_CONTRACT.length,
    observedCount: mapping?.length ?? 0,
  });
}

const configuredNames = STRIPE_TEST_PRICE_CONTRACT.filter(({ envKey }) => process.env[envKey]?.trim());
if (catalogIssues.length === 0 && configuredNames.length > 0) {
  if (configuredNames.length !== STRIPE_TEST_PRICE_CONTRACT.length) {
    throw new Error("STRIPE_PRICE_ENV_PARTIAL");
  }
  for (const entry of STRIPE_TEST_PRICE_CONTRACT) {
    if (process.env[entry.envKey]?.trim() !== discovered[entry.envKey]) {
      throw new Error(`STRIPE_PRICE_ENV_MISMATCH:${entry.envKey}`);
    }
  }
}

const webhookList = await stripe.webhookEndpoints.list({ limit: 100 });
const webhookMatches = webhookList.data.filter((endpoint) =>
  !endpoint.livemode && endpoint.url === expectedWebhookUrl
);
let webhookResult: Record<string, unknown>;
if (webhookMatches.length !== 1) {
  webhookResult = {
    status: "FAIL",
    reason: webhookMatches.length === 0 ? "STRIPE_TEST_WEBHOOK_MISSING" : "STRIPE_TEST_WEBHOOK_DUPLICATE",
    url: expectedWebhookUrl,
    observedCount: webhookMatches.length,
  };
} else {
  const webhook = webhookMatches[0];
  const enabledEvents = [...webhook.enabled_events].sort();
  const eventsValid = enabledEvents.length === expectedWebhookEvents.length
    && expectedWebhookEvents.every((event, index) => enabledEvents[index] === event);
  webhookResult = {
    url: expectedWebhookUrl,
    status: webhook.status === "enabled" && eventsValid ? "PASS" : "FAIL",
    ...(webhook.status !== "enabled" ? { reason: "STRIPE_TEST_WEBHOOK_DISABLED" } : {}),
    ...(webhook.status === "enabled" && !eventsValid ? { reason: "STRIPE_TEST_WEBHOOK_EVENTS_INVALID" } : {}),
    events: enabledEvents,
    endpointId: maskedId(webhook.id),
  };
}

if (catalogIssues.length > 0 || webhookResult.status !== "PASS") {
  throw new StripeAuditError("STRIPE_TEST_AUDIT_FAILED", {
    catalog: {
      status: catalogIssues.length === 0 ? "PASS" : "FAIL",
      passedPrices: results,
      issues: catalogIssues,
    },
    webhook: webhookResult,
  });
}

console.log(JSON.stringify({
  mode: "test",
  products: 3,
  prices: 6,
  results,
  webhook: webhookResult,
}, null, 2));
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify(safeFailure(error), null, 2)}\n`);
  process.exitCode = 1;
});
