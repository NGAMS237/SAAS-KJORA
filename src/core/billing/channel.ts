// =============================================================================
// Canal d'envoi des notifications de facturation (ALIGN-03)
// =============================================================================
// Module pur : il reçoit l'environnement en paramètre plutôt que de le lire.
// Aucune valeur de secret n'y figure ; seuls des noms de variables sont testés,
// et uniquement depuis le serveur qui les fournit.
//
// Règle : si le canal n'est pas configuré, l'événement est journalisé et aucun
// envoi n'est tenté. On ne produit jamais un faux email.
// =============================================================================

export type ChannelEnv = {
  RESEND_TRANSACTIONAL_API_KEY?: string;
  KJORA_TRANSACTIONAL_EMAIL_FROM?: string;
};

export function isBillingEmailChannelConfigured(env: ChannelEnv): boolean {
  return Boolean(
    env.RESEND_TRANSACTIONAL_API_KEY?.trim() && env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim(),
  );
}

export type DeliveryDecision =
  | { deliver: true }
  | { deliver: false; reason: "channel_not_configured" | "event_not_emailable" };

/** Décide s'il faut tenter un envoi. Aucun effet de bord. */
export function decideDelivery(input: {
  emailable: boolean;
  env: ChannelEnv;
}): DeliveryDecision {
  if (!input.emailable) return { deliver: false, reason: "event_not_emailable" };
  if (!isBillingEmailChannelConfigured(input.env)) {
    return { deliver: false, reason: "channel_not_configured" };
  }
  return { deliver: true };
}
