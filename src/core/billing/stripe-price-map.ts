import "server-only";

import type { BillingCycle } from "./model";
import type { PlanSlug } from "../entitlements/model";
import {
  readStripeTestPriceMapping,
  stripeTestPriceFromMapping,
} from "./stripe-price-contract";

export function stripeTestPrice(plan: PlanSlug, cycle: BillingCycle, env = process.env): string | null {
  return stripeTestPriceFromMapping(plan, cycle, env);
}

export function stripeTestPriceMapping(env = process.env) {
  return readStripeTestPriceMapping(env) ?? [];
}
