// =============================================================================
// KJORA — Événements de facturation SaaS (ALIGN-03)
// =============================================================================
// Catalogue des faits de facturation. Ce module DÉFINIT les événements ; il
// n'envoie rien.
//
// Règle : aucun email n'est émis si le canal transactionnel n'est pas
// configuré. Un canal absent produit un fait journalisé, jamais un faux envoi.
// =============================================================================

export const BILLING_EVENTS = [
  "renewal_reminder_j7",
  "renewal_reminder_j3",
  "renewal_reminder_j1",
  "payment_succeeded",
  "payment_failed",
  "grace_started",
  "block_imminent",
  "billing_blocked",
  "cancellation_scheduled",
  "reactivated",
] as const;

export type BillingEventType = (typeof BILLING_EVENTS)[number];

export function isBillingEventType(value: unknown): value is BillingEventType {
  return typeof value === "string" && (BILLING_EVENTS as readonly string[]).includes(value);
}

/** Libellé destiné à l'utilisateur : simple, jamais technique. */
export const BILLING_EVENT_LABELS: Record<BillingEventType, string> = {
  renewal_reminder_j7: "Votre abonnement se renouvelle dans 7 jours",
  renewal_reminder_j3: "Votre abonnement se renouvelle dans 3 jours",
  renewal_reminder_j1: "Votre abonnement se renouvelle demain",
  payment_succeeded: "Paiement reçu",
  payment_failed: "Paiement refusé",
  grace_started: "Période de tolérance ouverte",
  block_imminent: "Suspension imminente",
  billing_blocked: "Compte suspendu",
  cancellation_scheduled: "Annulation programmée",
  reactivated: "Abonnement réactivé",
};

/** Un événement doit-il déclencher un email lorsque le canal est configuré ? */
export const BILLING_EVENT_EMAILS: Record<BillingEventType, boolean> = {
  renewal_reminder_j7: true,
  renewal_reminder_j3: true,
  renewal_reminder_j1: true,
  payment_succeeded: true,
  payment_failed: true,
  grace_started: true,
  block_imminent: true,
  billing_blocked: true,
  cancellation_scheduled: true,
  reactivated: true,
};

// Le contrôle du canal d'envoi vit dans `channel.ts`, côté serveur uniquement :
// ce catalogue reste purement déclaratif et peut être importé par l'interface
// sans jamais faire référence à une variable d'environnement.
