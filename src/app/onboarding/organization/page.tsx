import { redirect } from "next/navigation";
import { OrganizationOnboardingForm } from "@/core/organization/organization-onboarding-form";
import { requireUser } from "@/core/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserContext, loadOnboardingState } from "@/core/routing/context-resolver";
import {
  parsePlanRequested,
  isSurMesure,
  needsIntentPreservation,
  planLabel,
  SUR_MESURE_CONTACT_URL,
} from "@/core/onboarding/plan-intent";

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
  searchParams: Promise<{ mode?: string; plan_requested?: string | string[] }>;
}) {
  await requireUser();
  const params = await searchParams;
  const planRequested = parsePlanRequested(params.plan_requested);

  // Sur mesure : route commerciale (§11)
  if (isSurMesure(planRequested)) redirect(SUR_MESURE_CONTACT_URL);

  // Les invitations priment sur la création d'une Organization inutile (§15)
  const context = await resolveUserContext();
  if (context.kind === "membership_invitation_pending") redirect("/invitation/accepter");
  if (context.kind === "portal_invitation_pending") redirect("/portal/invitation/accepter");

  const supabase = await createSupabaseServerClient();
  const state = await loadOnboardingState(supabase);

  const isNewOrgRequest = params.mode === "new";
  const hasOrganization = Boolean(state.organizationId)
    || context.kind === "owner_single_org"
    || context.kind === "owner_multi_org"
    || context.kind === "collaborator"
    || context.kind === "owner_and_tenant";

  // Onboarding déjà terminé et pas de demande explicite de nouvelle Organization
  if (state.step === "completed" && !isNewOrgRequest) redirect("/app");
  if (hasOrganization && state.step === "completed" && !isNewOrgRequest) redirect("/app");

  const resumed = state.exists && state.step !== "plan_intent";
  // L'intention enregistrée en base prime sur le paramètre d'URL une fois posée
  const effectiveIntent = state.planIntent ?? planRequested;

  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide">
        <span className="wordmark wordmark--auth">Kjora<span>.</span></span>
        <p className="eyebrow">
          {isNewOrgRequest
            ? "Nouvelle organisation"
            : resumed
              ? "Reprenons où vous en étiez"
              : "Première configuration"}
        </p>
        <h1>Créez votre espace de gestion.</h1>
        <p className="auth-intro">
          {needsIntentPreservation(effectiveIntent)
            ? `Vous démarrez sur Découverte, gratuitement. Votre intérêt pour le plan ${planLabel(effectiveIntent)} est conservé pour plus tard.`
            : "Nous configurons votre organisation, votre premier bien et votre premier logement."}
        </p>
        <OrganizationOnboardingForm
          initialState={state}
          planRequested={planRequested}
          isNewOrgRequest={isNewOrgRequest}
        />
      </section>
    </main>
  );
}
