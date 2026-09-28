// =============================================================================
// KJORA — Contrat d'adaptateur de provider de paiement SaaS (ALIGN-04A)
// =============================================================================
// Types et registre. Aucune clé, aucun appel réseau, aucun secret ici.
//
// Dix opérations sont nommées. **Aucun adaptateur n'est tenu de toutes les
// implémenter** : seules `createCheckout` et `verifyWebhook` sont obligatoires
// (REQUIRED_OPERATIONS). Le reste est optionnel, et ce que l'adaptateur
// implémente doit correspondre à ce qu'il déclare dans la matrice de capacités.
// L'écart entre les deux est un défaut, vérifié par test.
//
// Invariants imposés à tout adaptateur :
//   • Aucun secret provider ne franchit la frontière serveur.
//   • Toute opération débitrice est idempotente par `idempotencyKey`.
//   • Un webhook rejoué est sans effet grâce à `providerEventId`.
//   • Un plan payant n'est activé qu'après un événement provider vérifié.
//   • Le prorata n'est jamais recalculé par le provider : KJORA envoie un
//     montant déjà calculé en base, et refuse tout montant divergent au retour.
//   • Aucun numéro de moyen de paiement complet n'est jamais stocké.
// =============================================================================

import type { BillingCycle, BillingCurrency } from "./model.ts";
import type { PlanSlug } from "../entitlements/model.ts";
import type { RecurrenceMode } from "./types.ts";
import type {
  ProviderName,
  ProviderOperation,
  PaymentMethodKind,
} from "./provider-capabilities.ts";

export type { ProviderName, ProviderOperation, PaymentMethodKind };

/** Référence opaque renvoyée par un provider. Jamais un secret. */
export type ProviderRef = string;

/** Mode d'exécution. `live` n'existe pas encore : ALIGN-04A est sandbox seul. */
export type ProviderMode = "sandbox" | "live";

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export type CheckoutRequest = {
  organizationId: string;
  plan: PlanSlug;
  cycle: BillingCycle;
  currency: BillingCurrency;
  /** Calculé en base. Le client ne le transmet jamais. */
  amountMinor: number;
  method: PaymentMethodKind | null;
  /** Empreinte de la demande : un double envoi ne débite qu'une fois. */
  idempotencyKey: string;
  /** Chemin interne de retour, déjà validé par safeNextPath côté appelant. */
  returnPath: string;
  /** Price Stripe issu d'un mapping serveur fermé, jamais du navigateur. */
  providerPriceRef?: ProviderRef;
  /** Réutilisé lorsqu'il existe ; sinon Checkout crée le Customer. */
  providerCustomerRef?: ProviderRef | null;
  locale?: "fr" | "en";
};

export type CheckoutSession = {
  providerSessionRef: ProviderRef;
  /** URL hébergée par le provider vers laquelle rediriger. */
  redirectUrl: string;
  expiresAt: string;
  recurrence: RecurrenceMode;
};

export type SubscriptionRequest = {
  organizationId: string;
  plan: PlanSlug;
  cycle: BillingCycle;
  currency: BillingCurrency;
  amountMinor: number;
  providerCustomerRef: ProviderRef;
  idempotencyKey: string;
};

export type ProviderSubscription = {
  providerSubscriptionRef: ProviderRef;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  recurrence: RecurrenceMode;
};

export type PaymentStatus = "pending" | "succeeded" | "failed";

export type PaymentOutcome = {
  status: PaymentStatus;
  providerPaymentRef: ProviderRef;
  /** Montant réellement traité, en unité mineure. Rapproché du montant attendu. */
  amountMinor: number;
  currency: BillingCurrency;
  /** Code d'échec du provider, journalisé expurgé. */
  failureCode: string | null;
};

export type PaymentMethodSummary = {
  /** Marque et 4 derniers chiffres seulement — jamais le numéro complet. */
  brand: string | null;
  last4: string | null;
  expiresOn: string | null;
  kind: PaymentMethodKind;
};

// REVENUE-01F — Portail client hébergé par le provider (gérer son moyen de
// paiement, consulter son historique côté provider, se désabonner). Onzième
// opération du contrat : absente d'ALIGN-04A, ajoutée ici sans toucher aux
// dix premières ni aux déclarations de capacités déjà revues par provider.
export type CustomerPortalRequest = {
  organizationId: string;
  providerCustomerRef: ProviderRef;
  /** Chemin interne de retour, déjà validé par safeNextPath côté appelant. */
  returnPath: string;
  idempotencyKey: string;
};

export type CustomerPortalSession = {
  redirectUrl: string;
  expiresAt: string;
};

export type WebhookVerification =
  | {
      valid: true;
      /** Identifiant unique de l'événement chez le provider. Clé d'idempotence. */
      providerEventId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  | { valid: false; reason: WebhookRejectionReason };

export type WebhookRejectionReason =
  | "missing_signature"
  | "invalid_signature"
  | "malformed_payload"
  | "missing_event_id"
  | "unknown_provider"
  | "provider_not_configured";

// ---------------------------------------------------------------------------
// Le contrat
// ---------------------------------------------------------------------------

export type BillingProviderAdapter = {
  readonly name: ProviderName;
  readonly mode: ProviderMode;

  // --- Obligatoire ---------------------------------------------------------
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Vérifie la signature à partir du **corps brut**, jamais d'un JSON reparsé.
   * Un rejeu doit produire le même `providerEventId`.
   */
  verifyWebhook(rawBody: string, headers: Readonly<Record<string, string>>): Promise<WebhookVerification>;

  // --- Optionnel : présent si, et seulement si, déclaré dans la matrice -----
  createSubscription?(request: SubscriptionRequest): Promise<ProviderSubscription>;
  updateSubscription?(ref: ProviderRef, plan: PlanSlug, cycle: BillingCycle, idempotencyKey: string): Promise<ProviderSubscription>;
  cancelSubscription?(ref: ProviderRef, idempotencyKey: string): Promise<void>;
  chargeRecurring?(ref: ProviderRef, amountMinor: number, idempotencyKey: string): Promise<PaymentOutcome>;
  retryPayment?(ref: ProviderRef, idempotencyKey: string): Promise<PaymentOutcome>;
  fetchPaymentStatus?(ref: ProviderRef): Promise<PaymentOutcome>;
  fetchPaymentMethod?(ref: ProviderRef): Promise<PaymentMethodSummary>;
  refund?(ref: ProviderRef, amountMinor: number, idempotencyKey: string): Promise<void>;
  /** REVENUE-01F. Absent d'ALIGN-04A : aucun provider ne le déclare encore. */
  openCustomerPortal?(request: CustomerPortalRequest): Promise<CustomerPortalSession>;
};

/** Vérifie qu'un adaptateur expose bien l'opération demandée. */
export function adapterImplements(
  adapter: BillingProviderAdapter,
  operation: ProviderOperation,
): boolean {
  return typeof (adapter as unknown as Record<string, unknown>)[operation] === "function";
}

// ---------------------------------------------------------------------------
// Registre
// ---------------------------------------------------------------------------

const REGISTRY = new Map<ProviderName, BillingProviderAdapter>();

export function registerBillingProvider(adapter: BillingProviderAdapter): void {
  REGISTRY.set(adapter.name, adapter);
}

export function getBillingProvider(name: ProviderName): BillingProviderAdapter | null {
  return REGISTRY.get(name) ?? null;
}

export function registeredProviders(): ProviderName[] {
  return [...REGISTRY.keys()];
}

/** Aucun provider n'est branché tant qu'aucun adaptateur n'est enregistré. */
export function hasConfiguredProvider(): boolean {
  return REGISTRY.size > 0;
}

/** Réservé aux tests : vide le registre entre deux scénarios. */
export function resetBillingProviders(): void {
  REGISTRY.clear();
}
