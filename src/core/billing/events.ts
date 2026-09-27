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
  // Relances pendant la tolérance (ALIGN-00 §6.3 : J+1, J+3, J+6 après le
  // premier échec). Purement déclaratif ici : rien ne les déclenche encore
  // (aucun cron de facturation n'existe à ce stade — voir REVENUE-LAUNCH-01).
  "grace_reminder_j1",
  "grace_reminder_j3",
  "grace_reminder_j6",
  "block_imminent",
  "billing_blocked",
  "cancellation_scheduled",
  "reactivated",
  // Expiration du moyen de paiement (ALIGN-00 §6.2 : J-30, J-7), seulement si
  // le provider expose cette information — aucun n'est branché aujourd'hui.
  "payment_method_expiring_j30",
  "payment_method_expiring_j7",
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
  grace_reminder_j1: "Nouvelle tentative de paiement (J+1)",
  grace_reminder_j3: "Nouvelle tentative de paiement (J+3)",
  grace_reminder_j6: "Dernière tentative avant suspension (J+6)",
  block_imminent: "Suspension imminente",
  billing_blocked: "Compte suspendu",
  cancellation_scheduled: "Annulation programmée",
  reactivated: "Abonnement réactivé",
  payment_method_expiring_j30: "Votre moyen de paiement expire dans 30 jours",
  payment_method_expiring_j7: "Votre moyen de paiement expire dans 7 jours",
};

/** Un événement doit-il déclencher un email lorsque le canal est configuré ? */
export const BILLING_EVENT_EMAILS: Record<BillingEventType, boolean> = {
  renewal_reminder_j7: true,
  renewal_reminder_j3: true,
  renewal_reminder_j1: true,
  payment_succeeded: true,
  payment_failed: true,
  grace_started: true,
  grace_reminder_j1: true,
  grace_reminder_j3: true,
  grace_reminder_j6: true,
  block_imminent: true,
  billing_blocked: true,
  cancellation_scheduled: true,
  reactivated: true,
  payment_method_expiring_j30: true,
  payment_method_expiring_j7: true,
};

// Le contrôle du canal d'envoi vit dans `channel.ts`, côté serveur uniquement :
// ce catalogue reste purement déclaratif et peut être importé par l'interface
// sans jamais faire référence à une variable d'environnement.
