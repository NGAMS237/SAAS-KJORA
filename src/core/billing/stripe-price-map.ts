import "server-only";

import type { BillingCycle } from "./model";
import type { PlanSlug } from "../entitlements/model";
import {
  readStripeTestPriceMapping,
  readStripePriceMapping,
  stripePriceFromMapping,
  stripeTestPriceFromMapping,
} from "./stripe-price-contract";

export function stripeTestPrice(plan: PlanSlug, cycle: BillingCycle, env = process.env): string | null {
  return stripeTestPriceFromMapping(plan, cycle, env);
}

export function stripeTestPriceMapping(env = process.env) {
  return readStripeTestPriceMapping(env) ?? [];
}

export function stripePrice(environment: "test" | "live", plan: PlanSlug, cycle: BillingCycle, env = process.env): string | null {
  return stripePriceFromMapping(environment, plan, cycle, env);
}

export function stripePriceMapping(environment: "test" | "live", env = process.env) {
  return readStripePriceMapping(environment, env) ?? [];
}
