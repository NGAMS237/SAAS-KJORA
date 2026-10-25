import type { StripeEnvironment } from "./stripe-price-contract.ts";

/**
 * Resolves the only Stripe environment allowed to reach provider code.
 * Missing or contradictory configuration is deliberately unavailable: callers
 * must never infer Live from a key, a Price ID, or a single feature flag.
 */
export function resolveStripeEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): StripeEnvironment | null {
  const configuredMode = env.BILLING_PROVIDER_MODE?.trim() ?? "";
  if (configuredMode !== "sandbox" && configuredMode !== "live") return null;

  const testEnabled = env.BILLING_PROVIDER_STRIPE_TEST_ENABLED === "1";
  const inviteOnly = env.KJORA_PAID_PILOT_INVITE_ONLY?.trim() ?? "";
  // Both explicit pilot modes are valid.  `1` keeps the allowlist closed;
  // `0` is the separately approved public-launch mode.  An absent or malformed
  // value must remain fail-closed rather than silently opening Live Checkout.
  const hasExplicitPilotAccessMode = inviteOnly === "0" || inviteOnly === "1";
  const liveEnabled = env.KJORA_PAID_PILOT_ENABLED === "1"
    && hasExplicitPilotAccessMode
    && env.BILLING_PROVIDER_STRIPE_LIVE_ENABLED === "1";
  if (testEnabled === liveEnabled) return null;
  if (configuredMode === "sandbox") return testEnabled ? "test" : null;
  return liveEnabled ? "live" : null;
}

/** Whether Live Checkout must also pass the paid-pilot Organization allowlist. */
export function isPaidPilotInviteOnly(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.KJORA_PAID_PILOT_INVITE_ONLY?.trim() === "1";
}
