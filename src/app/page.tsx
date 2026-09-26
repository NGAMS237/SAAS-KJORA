import { redirect } from "next/navigation";
import { resolveUserContext, destinationFor } from "@/core/routing/context-resolver";
import {
  appendSiteAppIntent,
  buildConnexionUrl,
  buildSurMesureContactUrl,
  destinationAfterOnboarding,
  isSurMesure,
  parseSiteAppIntent,
  mergeSiteAppIntent,
  type SiteAppSearchParams,
} from "@/core/onboarding/plan-intent";
import { siteAppIntentFromOnboardingState } from "@/core/onboarding/onboarding-state";
import { persistIncomingSiteAppIntent } from "@/core/onboarding/server";

// =============================================================================
// ALIGN-02 §14 — Point d'entrée depuis le site commercial
// =============================================================================
// Un utilisateur déjà authentifié ne doit jamais se voir redemander son email :
// son contexte est recalculé côté serveur et il est routé directement.
// Un utilisateur non authentifié part vers /connexion en conservant son
// intention de plan.
//
// Les paramètres publics ne sont que des intentions validées. Le contexte,
// l'Organization, les droits et le plan effectif restent résolus côté serveur.
// =============================================================================

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<SiteAppSearchParams>;
}) {
  const [params, context] = await Promise.all([searchParams, resolveUserContext()]);
  const incomingIntent = parseSiteAppIntent(params);
  if (context.kind !== "unauthenticated") {
    await persistIncomingSiteAppIntent(incomingIntent);
  }
  const storedState = "onboarding" in context ? context.onboarding : null;
  const storedIntent = storedState?.intentStatus === "active"
    ? siteAppIntentFromOnboardingState(storedState)
    : null;
  const intent = mergeSiteAppIntent(incomingIntent, storedIntent);

  // Sur mesure : route commerciale, aucune activation automatique (§11)
  if (isSurMesure(intent.plan)) redirect(buildSurMesureContactUrl(intent));

  // Non authentifié : conserver l'intention à travers l'Auth
  if (context.kind === "unauthenticated") {
    redirect(buildConnexionUrl(intent));
  }

  // Déjà authentifié : recalcul serveur du contexte réel, aucun email redemandé
  const destination = destinationFor(context);

  // L'intention de plan survit jusqu'à l'onboarding lorsqu'il reste à faire
  if (intent.plan && destination.startsWith("/onboarding")) {
    redirect(appendSiteAppIntent(destination, intent));
  }

  // Existing Owners can confirm a paid intent against their server-selected
  // Organization. No URL value triggers a mutation automatically.
  if (
    (context.kind === "owner_single_org" || context.kind === "owner_multi_org")
    && destination === "/app"
  ) {
    redirect(destinationAfterOnboarding(intent));
  }

  redirect(destination);
}
