import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { currentBillingPlan, isCurrentBillingPlan } from "../src/core/billing/presentation.ts";
import { priceFor } from "../src/core/billing/model.ts";
import type { BillingOverview } from "../src/core/billing/types.ts";

function overview(effectivePlan: BillingOverview["effectivePlan"]): BillingOverview {
  return {
    organizationId: "00000000-0000-4000-8000-000000000001",
    effectivePlan,
    subscription: {
      exists: false,
      status: "free",
      // Deliberately stale legacy metadata: it must never govern the plan
      // shown to the Organization or block a new paid-plan request.
      plan: "avance",
      billingCycle: "monthly",
      currency: "CAD",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      renewalDate: null,
      graceEndsOn: null,
      cancellationEffectiveOn: null,
      scheduledPlan: null,
      scheduledCycle: null,
      scheduledEffectiveOn: null,
      pendingPlan: null,
      pendingCycle: null,
      pendingAmountMinor: null,
      provider: null,
      paymentMethodBrand: null,
      paymentMethodLast4: null,
      paymentMethodExpiresOn: null,
      lastPaymentState: null,
      lastPaymentAt: null,
      lastProviderSyncAt: null,
    },
    usage: { activeProperties: 1, activeUnits: 2, collaborators: 0, organizations: 1 },
    quotas: { maxProperties: 1, maxActiveUnits: 3, maxCollaborators: 0, maxOrganizations: 1 },
  };
}

test("manual Avancé revocation presents Découverte and leaves Avancé available at CAD 31.99/month", () => {
  const afterManualGrantRevocation = overview("decouverte");

  assert.equal(currentBillingPlan(afterManualGrantRevocation), "decouverte");
  assert.equal(isCurrentBillingPlan(afterManualGrantRevocation, "avance"), false);
  assert.equal(priceFor("avance", "monthly", "CAD"), 3199);
});

test("an active effective plan remains the common display and checkout comparison source", () => {
  const current = overview("avance");

  assert.equal(currentBillingPlan(current), "avance");
  assert.equal(isCurrentBillingPlan(current, "avance"), true);
});

test("an Admin manual-right mutation invalidates the customer billing route", () => {
  const actions = readFileSync(
    new URL("../src/modules/platform-admin/commercial-ops-actions.ts", import.meta.url),
    "utf8",
  );
  const billingPage = readFileSync(
    new URL("../src/app/(internal)/app/billing/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(actions.includes('revalidatePath("/app/billing")'));
  assert.ok(billingPage.includes('dynamic = "force-dynamic"'));
  assert.ok(billingPage.includes("const affordancePlan = requestedIntent.plan ?? currentPlan"));
});
