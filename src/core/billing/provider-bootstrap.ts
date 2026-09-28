import "server-only";

import { createStripeTestAdapter } from "./adapters/stripe-test-adapter";
import { isProviderConfigured, isProviderKillSwitched } from "./provider-config";
import { registerBillingProvider, registeredProviders } from "./provider";

export function ensureBillingProviders(): void {
  if (
    isProviderConfigured("stripe")
    && !isProviderKillSwitched("stripe")
    && !registeredProviders().includes("stripe")
  ) {
    registerBillingProvider(createStripeTestAdapter());
  }
}
