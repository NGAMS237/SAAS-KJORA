// =============================================================================
// Billing presentation state
// =============================================================================
// The effective entitlement is the only source of truth for the plan presented
// to an Organization and for deciding whether a requested plan is already
// active. Subscription metadata remains useful for its lifecycle, cycle and
// currency, but must not override an effective manual entitlement (or a
// subsequent revocation) in the UI.

import type { PlanSlug } from "../entitlements/model.ts";
import type { BillingOverview } from "./types.ts";

export function currentBillingPlan(overview: Pick<BillingOverview, "effectivePlan">): PlanSlug {
  return overview.effectivePlan;
}

export function isCurrentBillingPlan(
  overview: Pick<BillingOverview, "effectivePlan">,
  requestedPlan: PlanSlug | undefined,
): boolean {
  return requestedPlan !== undefined && requestedPlan === currentBillingPlan(overview);
}
