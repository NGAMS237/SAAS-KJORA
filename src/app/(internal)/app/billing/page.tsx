import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { activeStripeEnvironment, checkoutAffordance, getBillingOverview, getPaidPilotCheckoutAccess, listBillingInvoices } from "@/core/billing/server";
import { priceFor } from "@/core/billing/model";
import { BillingView } from "@/core/billing/billing-view";
import { currentBillingPlan } from "@/core/billing/presentation";
import { mergeSiteAppIntent, parseSiteAppIntent, subscriptionCurrencyForBillingCountry, type SiteAppSearchParams } from "@/core/onboarding/plan-intent";
import { siteAppIntentFromOnboardingState } from "@/core/onboarding/onboarding-state";
import { persistIncomingSiteAppIntent } from "@/core/onboarding/server";
import { loadOnboardingState } from "@/core/routing/context-resolver";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Billing always reads the current entitlement and subscription state. This is
// intentionally explicit: Admin commercial interventions must never leave an
// Organization on a cached former plan after grant or revocation.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Abonnement & facturation — réservé à l'Organization Owner (capability billing.view).
// Cette surface reste accessible même lorsque le compte est bloqué : c'est
// précisément depuis ici que le blocage se résout.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<SiteAppSearchParams>;
}) {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("billing.view")) notFound();

  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const incomingIntent = parseSiteAppIntent(params);
  await persistIncomingSiteAppIntent(incomingIntent);
  const [overview, invoices, state, rentalProfileResult, paidPilotAccess] = await Promise.all([
    getBillingOverview(authorization.organizationId),
    listBillingInvoices(authorization.organizationId),
    loadOnboardingState(supabase),
    supabase
      .from("organization_profiles")
      .select("country_code, currency_code")
      .eq("organization_id", authorization.organizationId)
      .maybeSingle(),
    getPaidPilotCheckoutAccess(authorization.organizationId),
  ]);

  if (!overview) notFound();

  // Le routage provider est décidé ici, côté serveur, à partir de l'état stocké
  // et du catalogue de prix. Aucun paramètre de requête n'y participe.
  const sub = overview.subscription;
  const currentPlan = currentBillingPlan(overview);
  const storedIntent = state.intentStatus === "active"
    ? siteAppIntentFromOnboardingState(state)
    : null;
  const requestedIntent = mergeSiteAppIntent(incomingIntent, storedIntent);
  // A prepared paid change is the authoritative Checkout target. Falling
  // back to the onboarding intent could otherwise evaluate Discovery and
  // disable Stripe even though an Avancé request is already pending.
  const affordancePlan = sub.pendingPlan ?? requestedIntent.plan ?? currentPlan;
  const affordanceCycle = sub.pendingCycle ?? requestedIntent.billingCycle ?? sub.billingCycle;
  const affordanceBillingCountry = sub.pendingPlan
    ? sub.billingCountry
    : requestedIntent.billingCountry ?? sub.billingCountry;
  const affordanceCurrency = affordanceBillingCountry
    ? subscriptionCurrencyForBillingCountry(affordanceBillingCountry)
    : sub.currency;
  const affordance = checkoutAffordance({
    plan: affordancePlan,
    cycle: affordanceCycle,
    currency: affordanceCurrency,
    amountMinor: priceFor(affordancePlan, affordanceCycle, affordanceCurrency) ?? 0,
    paidPilotInviteOnly: paidPilotAccess.inviteOnly,
    paidPilotEligible: paidPilotAccess.eligible,
  });

  const rentalProfile = rentalProfileResult.data;

  return <BillingView
    affordance={affordance}
    invoices={invoices}
    overview={overview}
    requestedIntent={requestedIntent}
    rentalMarket={rentalProfile ? { country: rentalProfile.country_code, currency: rentalProfile.currency_code } : null}
    stripeEnvironment={activeStripeEnvironment()}
  />;
}
