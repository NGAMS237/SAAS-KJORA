import type { StripeEnvironment } from "./stripe-price-contract.ts";

/**
 * Resolves the only Stripe environment allowed to reach provider code.
 * Missing or contradictory configuration is deliberately unavailable: callers
 * must never infer Live from a key, a Price ID, or a single feature flag.
 */
export function resolveStripeEnvironment(
  env: Pick<NodeJS.ProcessEnv,
    "BILLING_PROVIDER_MODE" | "BILLING_PROVIDER_STRIPE_TEST_ENABLED"
    | "KJORA_PAID_PILOT_ENABLED" | "KJORA_PAID_PILOT_INVITE_ONLY"
    | "BILLING_PROVIDER_STRIPE_LIVE_ENABLED">,
): StripeEnvironment | null {
  const configuredMode = env.BILLING_PROVIDER_MODE?.trim() ?? "";
  if (configuredMode !== "sandbox" && configuredMode !== "live") return null;

  const testEnabled = configuredMode === "sandbox" && env.BILLING_PROVIDER_STRIPE_TEST_ENABLED === "1";
  const liveEnabled = configuredMode === "live"
    && env.KJORA_PAID_PILOT_ENABLED === "1"
    && env.KJORA_PAID_PILOT_INVITE_ONLY === "1"
    && env.BILLING_PROVIDER_STRIPE_LIVE_ENABLED === "1";
  if (testEnabled === liveEnabled) return null;
  return liveEnabled ? "live" : "test";
}
