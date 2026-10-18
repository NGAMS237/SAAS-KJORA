import Stripe from "stripe";
import { STRIPE_LIVE_PRICE_CONTRACT } from "../src/core/billing/stripe-price-contract.ts";

// Ce script modifie Stripe Live. Il est volontairement inutilisable sans la
// double confirmation injectée par le runbook après GATE D.
const secret = process.env.STRIPE_LIVE_SECRET_KEY?.trim() ?? "";
if (!secret.startsWith("sk_live_")) throw new Error("STRIPE_LIVE_KEY_REQUIRED");
if (process.env.KJORA_STRIPE_LIVE_CATALOG_CHANGE_APPROVED !== "YES_I_APPROVE_STRIPE_LIVE_CHANGES") {
  throw new Error("STRIPE_LIVE_CHANGE_GATE_REQUIRED");
}
if (process.env.BILLING_PROVIDER_STRIPE_TEST_ENABLED === "1") {
  throw new Error("STRIPE_TEST_LIVE_MIX_REFUSED");
}

const stripe = new Stripe(secret);
const mask = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;
const products = await stripe.products.list({ active: true, limit: 100 });
const results: Array<Record<string, unknown>> = [];

for (const productName of new Set(STRIPE_LIVE_PRICE_CONTRACT.map((entry) => entry.productName))) {
  let matches = products.data.filter((product) => product.livemode && product.name === productName);
  if (matches.length > 1) throw new Error("STRIPE_LIVE_PRODUCT_DUPLICATE");
  if (matches.length === 0) {
    matches = [await stripe.products.create({ name: productName, metadata: { kjora_scope: "saas_subscription" } })];
    results.push({ action: "product_created", product: productName, productId: mask(matches[0].id) });
  }
  const product = matches[0];
  const expected = STRIPE_LIVE_PRICE_CONTRACT.filter((entry) => entry.productName === productName);
  const priceList = await stripe.prices.list({ active: true, product: product.id, type: "recurring", limit: 100 });
  for (const entry of expected) {
    const priceMatches = priceList.data.filter((price) => price.livemode && price.currency === "cad"
      && price.unit_amount === entry.amountMinor && price.recurring?.interval === entry.interval
      && price.recurring.interval_count === 1);
    if (priceMatches.length > 1) throw new Error("STRIPE_LIVE_PRICE_DUPLICATE");
    if (priceMatches.length === 0) {
      const price = await stripe.prices.create({
        product: product.id,
        currency: "cad",
        unit_amount: entry.amountMinor,
        recurring: { interval: entry.interval, interval_count: 1 },
        metadata: { kjora_plan: entry.plan, kjora_cycle: entry.cycle, kjora_market: "CA" },
      });
      results.push({ action: "price_created", envKey: entry.envKey, priceId: mask(price.id) });
    } else {
      results.push({ action: "price_unchanged", envKey: entry.envKey, priceId: mask(priceMatches[0].id) });
    }
  }
}

console.log(JSON.stringify({ mode: "live", status: "COMPLETE_REQUIRES_AUDIT", results }, null, 2));
