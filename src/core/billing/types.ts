// =============================================================================
// KJORA — Types partagés Billing (ALIGN-04A)
// =============================================================================
// Ce module est PUR : aucun `server-only`, aucun accès base, aucun secret.
// Il existe pour que le client (billing-view.tsx) puisse typer ce qu'il reçoit
// sans importer `server.ts`, qui est marqué `server-only`.
//
// Règle : le client peut importer `model.ts`, `types.ts` et
// `provider-capabilities.ts`. Il ne peut jamais importer `server.ts`,
// `provider-routing.ts`, `provider-secrets.ts` ni un adaptateur.
// =============================================================================

import type {
  BillingCycle,
  BillingCurrency,
  InvoiceStatus,
  SubscriptionStatus,
} from "./model.ts";
import type { PlanSlug } from "../entitlements/model.ts";
import type { BillingCountry } from "../onboarding/plan-intent.ts";

export type SubscriptionView = {
  exists: boolean;
  status: SubscriptionStatus;
  plan: PlanSlug;
  billingCycle: BillingCycle;
  /** Marché d'abonnement canonique, distinct du marché locatif. */
  billingCountry: BillingCountry;
  currency: BillingCurrency;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalDate: string | null;
  graceEndsOn: string | null;
  cancellationEffectiveOn: string | null;
  scheduledPlan: PlanSlug | null;
  scheduledCycle: BillingCycle | null;
  scheduledEffectiveOn: string | null;
  pendingPlan: PlanSlug | null;
  pendingCycle: BillingCycle | null;
  pendingAmountMinor: number | null;
  /** Nom du provider ayant servi le dernier règlement. Jamais une clé. */
  provider: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentMethodExpiresOn: string | null;
  lastPaymentState: "paid" | "failed" | "action_required" | null;
  lastPaymentAt: string | null;
  lastProviderSyncAt: string | null;
};

export type BillingUsage = {
  activeProperties: number;
  activeUnits: number;
  collaborators: number;
  organizations: number;
};

export type BillingQuotas = {
  maxProperties: number | null;
  maxActiveUnits: number | null;
  maxCollaborators: number | null;
  maxOrganizations: number | null;
};

export type BillingOverview = {
  organizationId: string;
  /** Plan qui gouverne réellement les entitlements (ALIGN-01). */
  effectivePlan: PlanSlug;
  subscription: SubscriptionView;
  usage: BillingUsage;
  quotas: BillingQuotas;
};

export type BillingInvoice = {
  id: string;
  number: string;
  plan: PlanSlug;
  billingCycle: BillingCycle;
  currency: BillingCurrency;
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  /** REVENUE-01B : échéance de paiement (null pour une facture antérieure : repli sur periodEnd). */
  dueOn: string | null;
  status: InvoiceStatus;
  issuedOn: string;
  paidAt: string | null;
  /** REVENUE-01B : libellé opaque d'un règlement manuel. Jamais une référence provider. */
  manualReference: string | null;
  /** REVENUE-01B : renseigné uniquement après confirmation manuelle par un platform_admin. */
  manualPaymentConfirmedAt: string | null;
  /** Distingue les factures SaaS fournisseur des factures manuelles et des documents locatifs. */
  source: "manual" | "automatic" | "provider";
};

// ---------------------------------------------------------------------------
// Ce que le serveur autorise l'interface à proposer
// ---------------------------------------------------------------------------

/**
 * Décidé côté serveur, lu côté client. Le client n'a jamais à connaître le
 * nom du provider retenu pour afficher un bouton : il lui suffit de savoir
 * ce qui est possible.
 */
export type BillingCheckoutAffordance = {
  /** Un règlement en ligne est-il possible pour cette Organization ? */
  online: boolean;
  /** Le prélèvement se fera-t-il seul, ou faudra-t-il valider chaque échéance ? */
  recurrence: RecurrenceMode | null;
  /** Raison lisible quand `online` est faux. Jamais un détail technique. */
  reason: CheckoutUnavailableReason | null;
};

export type CheckoutUnavailableReason =
  | "no_provider_configured"
  | "sandbox_only"
  | "pilot_invitation_required"
  | "currency_unsupported"
  | "plan_is_free"
  | "plan_requires_quote";

/**
 * Deux façons d'être abonné, imposées par la réalité du Mobile Money.
 *
 * `unattended` — le montant est prélevé seul à chaque cycle (carte tokenisée,
 * ou mandat MoMo activé chez le marchand).
 *
 * `customer_approved` — à chaque échéance, le client reçoit une demande qu'il
 * valide par USSD ou OTP. C'est le comportement par défaut du Mobile Money.
 *
 * La distinction change la promesse faite au client : l'interface doit la dire.
 */
export type RecurrenceMode = "unattended" | "customer_approved";

export const RECURRENCE_LABELS: Record<RecurrenceMode, string> = {
  unattended: "Prélèvement automatique",
  customer_approved: "Validation à chaque échéance",
};

export const RECURRENCE_MESSAGES: Record<RecurrenceMode, string> = {
  unattended:
    "Le montant sera prélevé automatiquement à chaque échéance. Vous pouvez arrêter à tout moment.",
  customer_approved:
    "À chaque échéance, vous recevrez une demande de paiement à valider sur votre téléphone. Rien n’est prélevé sans votre accord.",
};

export const CHECKOUT_UNAVAILABLE_MESSAGES: Record<CheckoutUnavailableReason, string> = {
  no_provider_configured:
    "Le règlement en ligne n’est pas encore disponible. Votre demande est enregistrée et nous revenons vers vous.",
  sandbox_only:
    "Le règlement en ligne est en cours de mise en service. Votre demande est enregistrée : aucun montant n’est débité.",
  pilot_invitation_required:
    "Le pilote payant est accessible uniquement sur invitation. Aucun paiement n’a été lancé.",
  currency_unsupported:
    "Aucun moyen de règlement en ligne n’est disponible pour cette devise. Nous revenons vers vous.",
  plan_is_free: "Ce plan est gratuit : aucun moyen de paiement n’est nécessaire.",
  plan_requires_quote:
    "Ce plan passe par un échange commercial plutôt que par une souscription en ligne.",
};
