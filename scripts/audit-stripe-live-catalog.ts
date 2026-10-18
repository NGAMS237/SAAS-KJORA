import Stripe from "stripe";
import {
  STRIPE_LIVE_PRICE_CONTRACT,
  readStripePriceMapping,
} from "../src/core/billing/stripe-price-contract.ts";

const EXPECTED_WEBHOOK_URL = "https://kjorapp.com/api/billing/webhooks/stripe";
const EXPECTED_EVENTS = [
  "charge.refunded",
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.paid",
  "invoice.payment_action_required",
  "invoice.payment_failed",
] as const;

const mask = (value: string) => value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : "masked";

function safeError(error: unknown) {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    status: "FAIL",
    reason: error instanceof Error && /^STRIPE_[A-Z0-9_:.-]+$/.test(error.message)
      ? error.message : "STRIPE_API_ERROR",
    type: typeof candidate.type === "string" ? candidate.type : "unknown",
    code: typeof candidate.code === "string" ? candidate.code : "unknown",
  };
}

async function main() {
  const secret = process.env.STRIPE_LIVE_SECRET_KEY?.trim() ?? "";
  if (!secret.startsWith("sk_live_")) throw new Error("STRIPE_LIVE_KEY_REQUIRED");
  if (process.env.BILLING_PROVIDER_STRIPE_TEST_ENABLED === "1") throw new Error("STRIPE_TEST_LIVE_MIX_REFUSED");

  const stripe = new Stripe(secret);
  const products = await stripe.products.list({ active: true, limit: 100 });
  const discovered: Record<string, string> = {};
  const results: Array<Record<string, unknown>> = [];

  for (const productName of new Set(STRIPE_LIVE_PRICE_CONTRACT.map((entry) => entry.productName))) {
    const matches = products.data.filter((product) => product.livemode && product.name === productName);
    if (matches.length !== 1) throw new Error(`STRIPE_LIVE_PRODUCT_COUNT:${matches.length}`);
    const expected = STRIPE_LIVE_PRICE_CONTRACT.filter((entry) => entry.productName === productName);
    const prices = await stripe.prices.list({ active: true, product: matches[0].id, type: "recurring", limit: 100 });
    const activeCad = prices.data.filter((price) => price.livemode && price.currency === "cad" && price.recurring);
    if (activeCad.length !== expected.length) throw new Error(`STRIPE_LIVE_PRICE_COUNT:${activeCad.length}`);
    for (const entry of expected) {
      const priceMatches = activeCad.filter((price) => price.unit_amount === entry.amountMinor
        && price.recurring?.interval === entry.interval && price.recurring.interval_count === 1);
      if (priceMatches.length !== 1) throw new Error(`STRIPE_LIVE_PRICE_CONTRACT:${entry.envKey}`);
      discovered[entry.envKey] = priceMatches[0].id;
      results.push({ envKey: entry.envKey, product: entry.productName, amountMinor: entry.amountMinor,
        currency: "CAD", cycle: entry.cycle, priceId: mask(priceMatches[0].id), status: "PASS" });
    }
  }

  if (!readStripePriceMapping("live", discovered)) throw new Error("STRIPE_LIVE_MAPPING_INVALID");
  const configured = STRIPE_LIVE_PRICE_CONTRACT.filter(({ envKey }) => process.env[envKey]?.trim());
  if (configured.length && configured.length !== STRIPE_LIVE_PRICE_CONTRACT.length) throw new Error("STRIPE_LIVE_ENV_PARTIAL");
  for (const entry of configured) {
    if (process.env[entry.envKey]?.trim() !== discovered[entry.envKey]) throw new Error(`STRIPE_LIVE_ENV_MISMATCH:${entry.envKey}`);
  }

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const matches = endpoints.data.filter((endpoint) => endpoint.livemode && endpoint.url === EXPECTED_WEBHOOK_URL);
  if (matches.length !== 1) throw new Error(`STRIPE_LIVE_WEBHOOK_COUNT:${matches.length}`);
  const enabled = [...matches[0].enabled_events].sort();
  if (matches[0].status !== "enabled" || enabled.length !== EXPECTED_EVENTS.length
    || !EXPECTED_EVENTS.every((event, index) => enabled[index] === event)) {
    throw new Error("STRIPE_LIVE_WEBHOOK_EVENTS_INVALID");
  }

  console.log(JSON.stringify({ mode: "live", products: 3, prices: 6, results,
    webhook: { status: "PASS", url: EXPECTED_WEBHOOK_URL, endpointId: mask(matches[0].id), events: enabled } }, null, 2));
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify(safeError(error), null, 2)}\n`);
  process.exitCode = 1;
});
