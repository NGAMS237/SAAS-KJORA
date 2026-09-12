import { redirect } from "next/navigation";
import { OrganizationOnboardingForm } from "@/core/organization/organization-onboarding-form";
import { requireUser } from "@/core/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserContext, loadOnboardingState } from "@/core/routing/context-resolver";
import {
  parseSiteAppIntent,
  mergeSiteAppIntent,
  isReplaceableIncomingIntent,
  destinationAfterOnboarding,
  buildSurMesureContactUrl,
  isSurMesure,
  needsIntentPreservation,
  planLabel,
  type SiteAppSearchParams,
} from "@/core/onboarding/plan-intent";
import { siteAppIntentFromOnboardingState } from "@/core/onboarding/onboarding-state";
import { persistIncomingSiteAppIntent } from "@/core/onboarding/server";

// =============================================================================
// ALIGN-02 — Onboarding nouveau propriétaire
// =============================================================================
// • plan_requested est validé côté serveur et n'accorde jamais d'entitlement.
// • sur_mesure part vers le contact commercial avant tout formulaire.
// • Une invitation en attente prime sur la création d'Organization (§15).
// • L'état est lu depuis onboarding_states : le parcours est reprenable.
// =============================================================================

export default async function OrganizationOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SiteAppSearchParams & { mode?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const incomingIntent = parseSiteAppIntent(params);
  const hasNewCommercialIntent = isReplaceableIncomingIntent(incomingIntent);
  if (hasNewCommercialIntent) await persistIncomingSiteAppIntent(incomingIntent);

  // Sur mesure : route commerciale (§11)
  if (isSurMesure(incomingIntent.plan)) redirect(buildSurMesureContactUrl(incomingIntent));

  // Les invitations priment sur la création d'une Organization inutile (§15)
  const context = await resolveUserContext();
  if (context.kind === "membership_invitation_pending") redirect("/invitation/accepter");
  if (context.kind === "portal_invitation_pending") redirect("/portal/invitation/accepter");

  const supabase = await createSupabaseServerClient();
  const state = await loadOnboardingState(supabase);
  const storedIntent = state.intentStatus === "active"
    ? siteAppIntentFromOnboardingState(state)
    : null;
  const intent = mergeSiteAppIntent(incomingIntent, storedIntent);
  const planRequested = intent.plan;
  if (isSurMesure(planRequested)) redirect(buildSurMesureContactUrl(intent));

  const isNewOrgRequest = params.mode === "new";
  const hasOrganization = Boolean(state.organizationId)
    || context.kind === "owner_single_org"
    || context.kind === "owner_multi_org"
    || context.kind === "collaborator"
    || context.kind === "owner_and_tenant";

  // Onboarding déjà terminé et pas de demande explicite de nouvelle Organization
  if (state.step === "completed" && !isNewOrgRequest) redirect(destinationAfterOnboarding(intent));
  if (hasOrganization && state.step === "completed" && !isNewOrgRequest) redirect(destinationAfterOnboarding(intent));

  const resumed = state.exists && state.step !== "plan_intent";
  const english = intent.locale === "en";

  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide">
        <span className="wordmark wordmark--auth">Kjora<span>.</span></span>
        <p className="eyebrow">
          {isNewOrgRequest
            ? (english ? "New organization" : "Nouvelle organisation")
            : resumed
              ? (english ? "Continue where you left off" : "Reprenons où vous en étiez")
              : (english ? "First-time setup" : "Première configuration")}
        </p>
        <h1>{english ? "Create your management workspace." : "Créez votre espace de gestion."}</h1>
        <p className="auth-intro">
          {needsIntentPreservation(planRequested)
            ? (english
              ? `You start on Discovery for free. Your ${planLabel(planRequested, "en")} selection is kept for the subscription step.`
              : `Vous démarrez sur Découverte, gratuitement. Votre intérêt pour le plan ${planLabel(planRequested)} est conservé pour l’étape d’abonnement.`)
            : (english
              ? "We will set up your organization, first property and first unit."
              : "Nous configurons votre organisation, votre premier bien et votre premier logement.")}
        </p>
        <OrganizationOnboardingForm
          initialState={state}
          planRequested={planRequested}
          billingCycle={intent.billingCycle}
          billingCountry={intent.billingCountry}
          locale={intent.locale}
          source={intent.source}
          isNewCommercialIntent={hasNewCommercialIntent}
          isNewOrgRequest={isNewOrgRequest}
        />
      </section>
    </main>
  );
}
