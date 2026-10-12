import type { BillingCycle } from "./model.ts";
import type { PlanSlug } from "../entitlements/model.ts";

export type StripeTestPaidPlan = Extract<PlanSlug, "essentiel" | "avance" | "patrimoine">;

export type StripeTestPriceContractEntry = {
  plan: StripeTestPaidPlan;
  cycle: BillingCycle;
  envKey: string;
  productName: string;
  amountMinor: number;
  interval: "month" | "year";
};

export const STRIPE_TEST_PRICE_CONTRACT: readonly StripeTestPriceContractEntry[] = [
  { plan: "essentiel", cycle: "monthly", envKey: "STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD", productName: "KJORA Essentiel", amountMinor: 1_499, interval: "month" },
  { plan: "essentiel", cycle: "annual", envKey: "STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD", productName: "KJORA Essentiel", amountMinor: 14_990, interval: "year" },
  { plan: "avance", cycle: "monthly", envKey: "STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD", productName: "KJORA Avancé", amountMinor: 3_199, interval: "month" },
  { plan: "avance", cycle: "annual", envKey: "STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD", productName: "KJORA Avancé", amountMinor: 31_990, interval: "year" },
  { plan: "patrimoine", cycle: "monthly", envKey: "STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD", productName: "KJORA Patrimoine", amountMinor: 6_199, interval: "month" },
  { plan: "patrimoine", cycle: "annual", envKey: "STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD", productName: "KJORA Patrimoine", amountMinor: 61_990, interval: "year" },
] as const;

export type StripeTestPriceMappingEntry = StripeTestPriceContractEntry & {
  priceId: string;
  currency: "CAD";
};

export function readStripeTestPriceMapping(
  env: Record<string, string | undefined>,
): StripeTestPriceMappingEntry[] | null {
  const entries = STRIPE_TEST_PRICE_CONTRACT.map((entry) => {
    const priceId = env[entry.envKey]?.trim() ?? "";
    return priceId.startsWith("price_") ? { ...entry, priceId, currency: "CAD" as const } : null;
  });
  if (entries.some((entry) => entry === null)) return null;
  const complete = entries as StripeTestPriceMappingEntry[];
  if (new Set(complete.map(({ priceId }) => priceId)).size !== STRIPE_TEST_PRICE_CONTRACT.length) {
    return null;
  }
  return complete;
}

export function stripeTestPriceFromMapping(
  plan: PlanSlug,
  cycle: BillingCycle,
  env: Record<string, string | undefined>,
): string | null {
  return readStripeTestPriceMapping(env)
    ?.find((entry) => entry.plan === plan && entry.cycle === cycle)
    ?.priceId ?? null;
}
