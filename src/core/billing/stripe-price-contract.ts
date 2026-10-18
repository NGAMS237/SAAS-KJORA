import type { BillingCycle } from "./model.ts";
import type { PlanSlug } from "../entitlements/model.ts";

export type StripePaidPlan = Extract<PlanSlug, "essentiel" | "avance" | "patrimoine">;
export type StripeEnvironment = "test" | "live";

export type StripePriceContractEntry = {
  plan: StripePaidPlan;
  cycle: BillingCycle;
  envKey: string;
  productName: string;
  amountMinor: number;
  interval: "month" | "year";
};

const PRICE_SHAPE = [
  { plan: "essentiel", cycle: "monthly", productName: "KJORA Essentiel", amountMinor: 1_499, interval: "month" },
  { plan: "essentiel", cycle: "annual", productName: "KJORA Essentiel", amountMinor: 14_990, interval: "year" },
  { plan: "avance", cycle: "monthly", productName: "KJORA Avancé", amountMinor: 3_199, interval: "month" },
  { plan: "avance", cycle: "annual", productName: "KJORA Avancé", amountMinor: 31_990, interval: "year" },
  { plan: "patrimoine", cycle: "monthly", productName: "KJORA Patrimoine", amountMinor: 6_199, interval: "month" },
  { plan: "patrimoine", cycle: "annual", productName: "KJORA Patrimoine", amountMinor: 61_990, interval: "year" },
] as const;

function contractFor(environment: StripeEnvironment): readonly StripePriceContractEntry[] {
  const prefix = environment === "live" ? "STRIPE_LIVE_PRICE" : "STRIPE_TEST_PRICE";
  return PRICE_SHAPE.map((entry) => ({
    ...entry,
    envKey: `${prefix}_${entry.plan.toUpperCase()}_${entry.cycle.toUpperCase()}_CAD`,
  }));
}

export const STRIPE_TEST_PRICE_CONTRACT: readonly StripePriceContractEntry[] = [
  { plan: "essentiel", cycle: "monthly", envKey: "STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD", productName: "KJORA Essentiel", amountMinor: 1_499, interval: "month" },
  { plan: "essentiel", cycle: "annual", envKey: "STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD", productName: "KJORA Essentiel", amountMinor: 14_990, interval: "year" },
  { plan: "avance", cycle: "monthly", envKey: "STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD", productName: "KJORA Avancé", amountMinor: 3_199, interval: "month" },
  { plan: "avance", cycle: "annual", envKey: "STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD", productName: "KJORA Avancé", amountMinor: 31_990, interval: "year" },
  { plan: "patrimoine", cycle: "monthly", envKey: "STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD", productName: "KJORA Patrimoine", amountMinor: 6_199, interval: "month" },
  { plan: "patrimoine", cycle: "annual", envKey: "STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD", productName: "KJORA Patrimoine", amountMinor: 61_990, interval: "year" },
] as const;

export const STRIPE_LIVE_PRICE_CONTRACT = contractFor("live");

export type StripePriceMappingEntry = StripePriceContractEntry & {
  priceId: string;
  currency: "CAD";
};

export function readStripeTestPriceMapping(
  env: Record<string, string | undefined>,
): StripePriceMappingEntry[] | null {
  return readStripePriceMapping("test", env);
}

export function readStripePriceMapping(
  environment: StripeEnvironment,
  env: Record<string, string | undefined>,
): StripePriceMappingEntry[] | null {
  const contract = environment === "live" ? STRIPE_LIVE_PRICE_CONTRACT : STRIPE_TEST_PRICE_CONTRACT;
  const entries = contract.map((entry) => {
    const priceId = env[entry.envKey]?.trim() ?? "";
    return priceId.startsWith("price_") ? { ...entry, priceId, currency: "CAD" as const } : null;
  });
  if (entries.some((entry) => entry === null)) return null;
  const complete = entries as StripePriceMappingEntry[];
  if (new Set(complete.map(({ priceId }) => priceId)).size !== contract.length) {
    return null;
  }
  return complete;
}

export function stripePriceFromMapping(
  environment: StripeEnvironment,
  plan: PlanSlug,
  cycle: BillingCycle,
  env: Record<string, string | undefined>,
): string | null {
  return readStripePriceMapping(environment, env)
    ?.find((entry) => entry.plan === plan && entry.cycle === cycle)
    ?.priceId ?? null;
}

export function stripeTestPriceFromMapping(
  plan: PlanSlug,
  cycle: BillingCycle,
  env: Record<string, string | undefined>,
): string | null {
  return stripePriceFromMapping("test", plan, cycle, env);
}
