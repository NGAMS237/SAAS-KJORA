// =============================================================================
// KJORA Analytics — ALIGN-02 : funnel Site → Auth → Onboarding
// =============================================================================
// Interdictions absolues dans tout payload :
//   • aucun token, code Magic Link, PKCE verifier, secret ;
//   • aucune donnée financière ;
//   • aucun email, user_id, organization_id ni autre identifiant interne.
//
// Les seules valeurs autorisées sont des slugs de plan publics, des noms
// d'étapes opaques et des compteurs de quota.
// =============================================================================

export const ANALYTICS_EVENTS = [
  "site_cta_clicked",
  "auth_started",
  "magic_link_sent",
  "auth_completed",
  "plan_intent_received",
  "onboarding_started",
  "organization_created",
  "first_property_created",
  "first_unit_created",
  "onboarding_completed",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsPayload = {
  /** Émis par le site commercial avant toute redirection vers KJORA */
  site_cta_clicked: { plan_requested: string };
  /** L'utilisateur ouvre /connexion */
  auth_started: { plan_requested: string | null };
  /** Le Magic Link / OTP a été envoyé */
  magic_link_sent: { plan_requested: string | null };
  /** Le callback PKCE a réussi et la session est créée */
  auth_completed: Record<string, never>;
  /** Une intention de plan valide a été reçue et enregistrée côté serveur */
  plan_intent_received: { plan_intent: string; activated: false };
  /** L'écran d'onboarding est affiché (première fois ou reprise) */
  onboarding_started: { plan_intent: string | null; resumed: boolean };
  /** Organization créée — le plan effectif est toujours Découverte */
  organization_created: { plan_effective: string; plan_intent: string | null };
  /** Premier bien créé pendant l'onboarding */
  first_property_created: { property_type: string };
  /** Premier logement créé pendant l'onboarding */
  first_unit_created: { unit_type: string };
  /** Onboarding terminé, l'utilisateur atteint le dashboard réel */
  onboarding_completed: { plan_effective: string };
};

/**
 * Émet un événement analytics côté client.
 * Ne jamais appeler avec des données sensibles : le typage ci-dessus est la garde.
 */
export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  payload: AnalyticsPayload[E],
): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") {
    console.info("[kjora:analytics]", event, payload);
  }
  // Branchement d'un fournisseur réel ici — le contrat de payload reste identique.
}
