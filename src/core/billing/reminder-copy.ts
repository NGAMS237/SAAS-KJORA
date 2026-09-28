// =============================================================================
// KJORA — Modèles FR/EN des rappels de facturation (REVENUE-01C)
// =============================================================================
// Module PUR : aucun envoi, aucun accès base, aucun secret. Fournit le texte
// que `channel.ts` enverrait UNE FOIS le canal transactionnel réellement
// câblé sur ces événements — ce qui n'est pas fait dans ce lot (aucun envoi
// réel n'est autorisé). Même patron `t(fr, en)` que `billing-view.tsx`.
//
// Seuls les 10 types de rappel réellement planifiés par
// `reminder-schedule.ts` ont un modèle ici : les autres événements de
// `events.ts` (paiement réussi/refusé, annulation, réactivation...) ont déjà
// leur libellé dans `BILLING_EVENT_LABELS` et ne relèvent pas d'un rappel
// planifié à date fixe.
// =============================================================================

import type { BillingEventType } from "./events.ts";

export type ReminderType =
  | "renewal_reminder_j7" | "renewal_reminder_j3" | "renewal_reminder_j1"
  | "grace_reminder_j1" | "grace_reminder_j3" | "grace_reminder_j6"
  | "payment_method_expiring_j30" | "payment_method_expiring_j7"
  | "invoice_due_soon" | "invoice_overdue";

export const REMINDER_TYPES: readonly ReminderType[] = [
  "renewal_reminder_j7", "renewal_reminder_j3", "renewal_reminder_j1",
  "grace_reminder_j1", "grace_reminder_j3", "grace_reminder_j6",
  "payment_method_expiring_j30", "payment_method_expiring_j7",
  "invoice_due_soon", "invoice_overdue",
] as const;

export function isReminderType(value: unknown): value is ReminderType {
  return typeof value === "string" && (REMINDER_TYPES as readonly string[]).includes(value as ReminderType);
}

/** Chaque type de rappel planifié est un événement `events.ts` reconnu. */
export const REMINDER_EVENT_TYPE: Record<ReminderType, BillingEventType> = {
  renewal_reminder_j7: "renewal_reminder_j7",
  renewal_reminder_j3: "renewal_reminder_j3",
  renewal_reminder_j1: "renewal_reminder_j1",
  grace_reminder_j1: "grace_reminder_j1",
  grace_reminder_j3: "grace_reminder_j3",
  grace_reminder_j6: "grace_reminder_j6",
  payment_method_expiring_j30: "payment_method_expiring_j30",
  payment_method_expiring_j7: "payment_method_expiring_j7",
  invoice_due_soon: "invoice_due_soon",
  invoice_overdue: "invoice_overdue",
};

export type ReminderCopy = { subject: string; body: string };

/**
 * Modèle statique, sans donnée variable : la mise en forme des montants/dates
 * appartient à l'appelant (server-only), ce module reste pur et sans accès
 * base. Le texte est délibérément générique — aucun montant, aucune date, ni
 * aucun nom de fournisseur.
 */
export const REMINDER_COPY: Record<ReminderType, { fr: ReminderCopy; en: ReminderCopy }> = {
  renewal_reminder_j7: {
    fr: { subject: "Votre abonnement KJORA se renouvelle dans 7 jours",
      body: "Votre abonnement se renouvelle dans 7 jours. Aucune action n'est requise si votre moyen de paiement habituel reste valide." },
    en: { subject: "Your KJORA subscription renews in 7 days",
      body: "Your subscription renews in 7 days. No action is needed if your usual payment method stays valid." },
  },
  renewal_reminder_j3: {
    fr: { subject: "Votre abonnement KJORA se renouvelle dans 3 jours",
      body: "Votre abonnement se renouvelle dans 3 jours." },
    en: { subject: "Your KJORA subscription renews in 3 days",
      body: "Your subscription renews in 3 days." },
  },
  renewal_reminder_j1: {
    fr: { subject: "Votre abonnement KJORA se renouvelle demain",
      body: "Votre abonnement se renouvelle demain." },
    en: { subject: "Your KJORA subscription renews tomorrow",
      body: "Your subscription renews tomorrow." },
  },
  grace_reminder_j1: {
    fr: { subject: "Nouvelle tentative de règlement pour votre abonnement KJORA",
      body: "Le dernier règlement n'a pas abouti. Vous gardez l'accès complet pendant la période de tolérance. Une nouvelle tentative est en cours." },
    en: { subject: "New payment attempt for your KJORA subscription",
      body: "The last payment did not go through. You keep full access during the grace period. A new attempt is underway." },
  },
  grace_reminder_j3: {
    fr: { subject: "Votre abonnement KJORA reste en attente de règlement",
      body: "Le règlement de votre abonnement est toujours en attente. Vous gardez l'accès complet, mais réglez dès que possible pour éviter une suspension." },
    en: { subject: "Your KJORA subscription payment is still pending",
      body: "Your subscription payment is still pending. You keep full access, but please settle it soon to avoid suspension." },
  },
  grace_reminder_j6: {
    fr: { subject: "Dernier rappel avant suspension de votre compte KJORA",
      body: "Sans règlement d'ici demain, votre compte sera suspendu. Vos données restent intactes ; réglez votre abonnement pour retrouver un accès normal." },
    en: { subject: "Last reminder before your KJORA account is suspended",
      body: "Without payment by tomorrow, your account will be suspended. Your data stays intact; settle your subscription to keep normal access." },
  },
  payment_method_expiring_j30: {
    fr: { subject: "Votre moyen de paiement KJORA expire dans 30 jours",
      body: "Le moyen de paiement enregistré pour votre abonnement expire dans 30 jours. Pensez à le mettre à jour." },
    en: { subject: "Your KJORA payment method expires in 30 days",
      body: "The payment method on file for your subscription expires in 30 days. Consider updating it." },
  },
  payment_method_expiring_j7: {
    fr: { subject: "Votre moyen de paiement KJORA expire dans 7 jours",
      body: "Le moyen de paiement enregistré pour votre abonnement expire dans 7 jours." },
    en: { subject: "Your KJORA payment method expires in 7 days",
      body: "The payment method on file for your subscription expires in 7 days." },
  },
  invoice_due_soon: {
    fr: { subject: "Une facture KJORA arrive à échéance",
      body: "Une facture d'abonnement KJORA arrive bientôt à échéance. Réglez-la par le moyen habituel (Mobile Money, virement, espèces) pour maintenir votre abonnement actif." },
    en: { subject: "A KJORA invoice is coming due",
      body: "A KJORA subscription invoice is coming due soon. Pay it through your usual method (Mobile Money, bank transfer, cash) to keep your subscription active." },
  },
  invoice_overdue: {
    fr: { subject: "Une facture KJORA est en retard",
      body: "Une facture d'abonnement KJORA n'a pas été réglée à sa date d'échéance. Réglez-la dès que possible pour éviter une interruption de service." },
    en: { subject: "A KJORA invoice is overdue",
      body: "A KJORA subscription invoice was not paid by its due date. Please pay it as soon as possible to avoid a service interruption." },
  },
};
