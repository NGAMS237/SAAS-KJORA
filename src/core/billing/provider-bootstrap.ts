import "server-only";

import { createStripeAdapter } from "./adapters/stripe-test-adapter";
import { isProviderConfigured, isProviderKillSwitched, stripeEnvironment } from "./provider-config";
import { registerBillingProvider, registeredProviders } from "./provider";

export function ensureBillingProviders(): void {
  if (
    isProviderConfigured("stripe")
    && !isProviderKillSwitched("stripe")
    && !registeredProviders().includes("stripe")
  ) {
    const environment = stripeEnvironment();
    if (environment) registerBillingProvider(createStripeAdapter(undefined, process.env, environment));
  }
}
