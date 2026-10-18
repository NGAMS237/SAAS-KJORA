import type { BillingCycle } from "./model.ts";
import type { StripePaidPlan } from "./stripe-price-contract.ts";

export type BillingTransactionalEvent =
  | "pilot_invitation"
  | "subscription_activated"
  | "payment_received"
  | "payment_failed"
  | "payment_action_required"
  | "cancellation_scheduled"
  | "subscription_cancelled";

type BillingTransactionalContext = {
  organizationName: string;
  plan: StripePaidPlan;
  cycle: BillingCycle;
};

export type BillingTransactionalMessage = {
  subject: string;
  heading: string;
  body: string;
  actionLabel: string | null;
};

/**
 * Contenu prêt pour un futur transport transactionnel. Cette fonction pure
 * n'envoie rien, ne reçoit aucune donnée de carte et ne contient aucune
 * référence fournisseur. L'envoi reste désactivé tant qu'un lot dédié ne
 * l'autorise pas explicitement.
 */
export function billingTransactionalCopy(
  event: BillingTransactionalEvent,
  locale: "fr" | "en",
  context: BillingTransactionalContext,
): BillingTransactionalMessage {
  const cycle = locale === "fr"
    ? (context.cycle === "annual" ? "annuel" : "mensuel")
    : context.cycle;
  const plan = context.plan.charAt(0).toUpperCase() + context.plan.slice(1);
  const details = locale === "fr"
    ? `${plan}, cycle ${cycle}, pour ${context.organizationName}.`
    : `${plan}, ${cycle} cycle, for ${context.organizationName}.`;

  const messages: Record<"fr" | "en", Record<BillingTransactionalEvent, Omit<BillingTransactionalMessage, "body"> & { body: string }>> = {
    fr: {
      pilot_invitation: { subject: "Invitation au pilote payant KJORA", heading: "Votre invitation est prête", body: `Vous pouvez préparer votre abonnement ${details}`, actionLabel: "Ouvrir KJORA" },
      subscription_activated: { subject: "Abonnement KJORA activé", heading: "Votre abonnement est actif", body: `Le paiement confirmé a activé votre abonnement ${details}`, actionLabel: "Voir mon abonnement" },
      payment_received: { subject: "Paiement KJORA reçu", heading: "Paiement confirmé", body: `Le paiement de votre abonnement a été confirmé. ${details}`, actionLabel: "Voir mes factures" },
      payment_failed: { subject: "Paiement KJORA non abouti", heading: "Votre paiement doit être vérifié", body: `Le paiement n'a pas été confirmé. Votre accès n'a pas été étendu sur la base de cette tentative. ${details}`, actionLabel: "Mettre à jour le paiement" },
      payment_action_required: { subject: "Action requise pour votre paiement KJORA", heading: "Une confirmation est requise", body: `Stripe demande une action supplémentaire avant confirmation du paiement. ${details}`, actionLabel: "Continuer le paiement" },
      cancellation_scheduled: { subject: "Résiliation KJORA planifiée", heading: "Votre résiliation est planifiée", body: `Votre abonnement restera accessible jusqu'à la date affichée dans KJORA. ${details}`, actionLabel: "Voir mon abonnement" },
      subscription_cancelled: { subject: "Abonnement KJORA résilié", heading: "Votre abonnement payant est terminé", body: `Votre Organization utilise désormais le forfait Découverte. ${details}`, actionLabel: "Voir KJORA" },
    },
    en: {
      pilot_invitation: { subject: "KJORA paid pilot invitation", heading: "Your invitation is ready", body: `You can prepare your subscription: ${details}`, actionLabel: "Open KJORA" },
      subscription_activated: { subject: "KJORA subscription activated", heading: "Your subscription is active", body: `The confirmed payment activated your subscription: ${details}`, actionLabel: "View my subscription" },
      payment_received: { subject: "KJORA payment received", heading: "Payment confirmed", body: `Your subscription payment was confirmed. ${details}`, actionLabel: "View my invoices" },
      payment_failed: { subject: "KJORA payment unsuccessful", heading: "Your payment needs attention", body: `The payment was not confirmed. This attempt did not extend your access. ${details}`, actionLabel: "Update payment" },
      payment_action_required: { subject: "Action required for your KJORA payment", heading: "Confirmation is required", body: `Stripe requires an additional action before the payment can be confirmed. ${details}`, actionLabel: "Continue payment" },
      cancellation_scheduled: { subject: "KJORA cancellation scheduled", heading: "Your cancellation is scheduled", body: `Your subscription remains available until the date shown in KJORA. ${details}`, actionLabel: "View my subscription" },
      subscription_cancelled: { subject: "KJORA subscription cancelled", heading: "Your paid subscription has ended", body: `Your Organization now uses the Discovery plan. ${details}`, actionLabel: "View KJORA" },
    },
  };

  return messages[locale][event];
}
