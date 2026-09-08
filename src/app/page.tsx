import { redirect } from "next/navigation";
import { resolveUserContext, destinationFor } from "@/core/routing/context-resolver";
import { parsePlanRequested, isSurMesure, buildConnexionUrl, SUR_MESURE_CONTACT_URL } from "@/core/onboarding/plan-intent";

// =============================================================================
// ALIGN-02 §14 — Point d'entrée depuis le site commercial
// =============================================================================
// Un utilisateur déjà authentifié ne doit jamais se voir redemander son email :
// son contexte est recalculé côté serveur et il est routé directement.
// Un utilisateur non authentifié part vers /connexion en conservant son
// intention de plan.
//
// Aucune décision de routage ne repose sur un paramètre d'URL autre que
// plan_requested, qui n'est qu'une intention et n'accorde aucun droit.
// =============================================================================

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ plan_requested?: string | string[] }>;
}) {
  const [params, context] = await Promise.all([searchParams, resolveUserContext()]);
  const planRequested = parsePlanRequested(params.plan_requested);

  // Sur mesure : route commerciale, aucune activation automatique (§11)
  if (isSurMesure(planRequested)) redirect(SUR_MESURE_CONTACT_URL);

  // Non authentifié : conserver l'intention à travers l'Auth
  if (context.kind === "unauthenticated") {
    redirect(buildConnexionUrl(planRequested));
  }

  // Déjà authentifié : recalcul serveur du contexte réel, aucun email redemandé
  const destination = destinationFor(context);

  // L'intention de plan survit jusqu'à l'onboarding lorsqu'il reste à faire
  if (planRequested && destination.startsWith("/onboarding")) {
    const separator = destination.includes("?") ? "&" : "?";
    redirect(`${destination}${separator}plan_requested=${planRequested}`);
  }

  redirect(destination);
}
