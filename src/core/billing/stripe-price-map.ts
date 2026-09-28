import "server-only";

import type { BillingCycle } from "./model";
import type { PlanSlug } from "../entitlements/model";

const PRICE_KEYS = {
  essentiel: {
    monthly: "STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD",
    annual: "STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD",
  },
  avance: {
    monthly: "STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD",
    annual: "STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD",
  },
  patrimoine: {
    monthly: "STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD",
    annual: "STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD",
  },
} as const;

export function stripeTestPrice(plan: PlanSlug, cycle: BillingCycle, env = process.env): string | null {
  if (!(plan in PRICE_KEYS)) return null;
  const key = PRICE_KEYS[plan as keyof typeof PRICE_KEYS][cycle];
  const value = env[key]?.trim();
  return value?.startsWith("price_") ? value : null;
}

export function stripeTestPriceMapping(env = process.env) {
  return Object.entries(PRICE_KEYS).flatMap(([plan, cycles]) =>
    Object.entries(cycles).flatMap(([cycle, key]) => {
      const value = env[key]?.trim();
      return value?.startsWith("price_") ? [{ priceId: value, plan, cycle, currency: "CAD" as const }] : [];
    }),
  );
}
