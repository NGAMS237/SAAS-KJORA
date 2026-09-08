// =============================================================================
// KJORA — Contrat d'adaptateur de provider de paiement SaaS (ALIGN-03)
// =============================================================================
// Ce fichier ne contient QUE des types et un registre vide.
//
// Aucune implémentation Stripe, CamPay, Flutterwave, PayUnit, ElyonPay ou autre
// n'appartient à ce lot. ALIGN-04 fournira les adaptateurs concrets.
//
// Invariants que tout futur adaptateur devra respecter :
//   • Aucun secret provider ne franchit la frontière serveur.
//   • Toute opération est idempotente : un même `idempotencyKey` ne produit
//     jamais deux débits.
//   • Un webhook est rejoué sans effet grâce à `providerEventId`.
//   • Un plan payant n'est activé qu'après `verifyPayment` concluant.
//   • Aucune référence stockée ne doit être une donnée sensible : on conserve
//     des identifiants opaques et, au plus, la marque et les 4 derniers
//     chiffres d'un moyen de paiement.
// =============================================================================

import type { BillingCycle, BillingCurrency } from "@/core/billing/model";
import type { PlanSlug } from "@/core/entitlements/model";

// ---------------------------------------------------------------------------
// Types d'échange
// ---------------------------------------------------------------------------

export type ProviderName = "stripe" | "campay" | "flutterwave" | "payunit" | "elyonpay";

/** Référence opaque renvoyée par un provider. Jamais un secret. */
export type ProviderRef = string;

export type CheckoutRequest = {
  organizationId: string;
  plan: PlanSlug;
  cycle: BillingCycle;
  currency: BillingCurrency;
  amountMinor: number;
  /** Empreinte de la demande : garantit qu'un double envoi ne débite qu'une fois. */
  idempotencyKey: string;
  /** URL interne de retour, validée par safeNextPath côté appelant. */
  returnPath: string;
};

export type CheckoutSession = {
  providerSessionRef: ProviderRef;
  /** URL hébergée par le provider vers laquelle rediriger l'utilisateur. */
  redirectUrl: string;
  expiresAt: string;
};

export type SubscriptionRequest = {
  organizationId: string;
  plan: PlanSlug;
  cycle: BillingCycle;
  currency: BillingCurrency;
  providerCustomerRef: ProviderRef;
  idempotencyKey: string;
};

export type ProviderSubscription = {
  providerSubscriptionRef: ProviderRef;
  currentPeriodStart: string;
  currentPeriodEnd: string;
};

export type PaymentStatus = "pending" | "succeeded" | "failed";

export type PaymentOutcome = {
  status: PaymentStatus;
  providerPaymentRef: ProviderRef;
  /** Code d'échec du provider, à journaliser expurgé. */
  failureCode: string | null;
  /** Marque et 4 derniers chiffres uniquement — jamais le numéro complet. */
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
};

export type WebhookVerification =
  | { valid: true; providerEventId: string; eventType: string; payload: Record<string, unknown> }
  | { valid: false; reason: string };

// ---------------------------------------------------------------------------
// Contrat
// ---------------------------------------------------------------------------

export type BillingProviderAdapter = {
  readonly name: ProviderName;
  /** Devises que ce provider sait traiter. */
  readonly supportedCurrencies: readonly BillingCurrency[];
  /** Le provider sait-il rembourser ? Tous ne le permettent pas. */
  readonly supportsRefund: boolean;

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  createSubscription(request: SubscriptionRequest): Promise<ProviderSubscription>;
  cancelSubscription(ref: ProviderRef): Promise<void>;
  retryPayment(ref: ProviderRef, idempotencyKey: string): Promise<PaymentOutcome>;
  fetchPaymentStatus(ref: ProviderRef): Promise<PaymentOutcome>;
  /** Vérifie la signature d'un webhook. Un rejeu doit produire le même id. */
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookVerification>;
  /** Optionnel : absent si `supportsRefund` est faux. */
  refund?(ref: ProviderRef, amountMinor: number, idempotencyKey: string): Promise<void>;
};

// ---------------------------------------------------------------------------
// Registre — volontairement vide dans ce lot
// ---------------------------------------------------------------------------

const REGISTRY = new Map<ProviderName, BillingProviderAdapter>();

/** ALIGN-04 enregistrera ici les adaptateurs réels. */
export function registerBillingProvider(adapter: BillingProviderAdapter): void {
  REGISTRY.set(adapter.name, adapter);
}

export function getBillingProvider(name: ProviderName): BillingProviderAdapter | null {
  return REGISTRY.get(name) ?? null;
}

/** Aucun provider n'est branché tant qu'ALIGN-04 n'a pas été livré. */
export function hasConfiguredProvider(): boolean {
  return REGISTRY.size > 0;
}
