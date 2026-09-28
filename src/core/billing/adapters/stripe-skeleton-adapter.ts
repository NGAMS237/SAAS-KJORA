import "server-only";
/* eslint-disable @typescript-eslint/no-unused-vars -- chaque paramètre existe
   pour satisfaire la SIGNATURE du contrat `BillingProviderAdapter` ; le corps
   de chaque méthode rejette avant de jamais les lire (voir `notImplemented`
   ci-dessous). Les préfixer par `_` ne suffit pas ici : plusieurs méthodes
   n'ont AUCUN paramètre utilisé, ce que la configuration ESLint de ce projet
   ne réduit pas au silence automatiquement (contrairement à un unique
   paramètre non-final, déjà toléré ailleurs dans le code, ex.
   `src/app/api/contracts/[contractId]/download/route.ts`). */

// =============================================================================
// KJORA — Squelette d'adaptateur Stripe (REVENUE-01F)
// =============================================================================
// CE QUE CE FICHIER EST : la mise en forme concrète, pour Stripe, du contrat
// `BillingProviderAdapter` (provider.ts) — l'architecture "préparée pour
// Stripe" que le Canada/diaspora attend (décision produit verrouillée,
// REVENUE-LAUNCH-01 : "architecture préparée pour Stripe avec abonnement et
// prélèvement automatique, SANS appel réel ni activation Live").
//
// CE QUE CE FICHIER N'EST PAS :
//   • Ce n'est PAS une réouverture de la décision D-143/ALIGN-04A. Stripe
//     reste `status: "rejected"` dans provider-capabilities.ts : le marchand
//     camerounais (STE VERALUZ SARL) ne peut toujours pas ouvrir de compte
//     Stripe, et ce fichier ne change NI ne contourne ce fait. Ce squelette
//     ne concerne qu'une piste Canada/diaspora future, distincte, non décidée.
//   • Ce n'est PAS une intégration fonctionnelle : AUCUNE méthode ci-dessous
//     n'effectue d'appel réseau. Chaque opération lève une erreur explicite
//     via `notImplemented()`, y compris `createCheckout` (pourtant une
//     opération obligatoire du contrat) — la satisfaire au niveau du TYPE
//     n'exige pas qu'elle fonctionne.
//   • Ce n'est PAS un provider "opérationnel" : cet adaptateur n'est
//     enregistré nulle part (`registerBillingProvider` n'est jamais appelé
//     dans ce lot). Tant qu'il ne l'est pas, `hasConfiguredProvider()` et
//     `getBillingProvider("stripe")` se comportent exactement comme avant ce
//     fichier. L'enregistrer un jour est une décision distincte, future, hors
//     de ce mandat.
//   • Ce n'est PAS un lecteur de clé : `apiSecret("stripe")` n'est appelé
//     nulle part ici. Seul `webhookSecret("stripe")` est lu, uniquement pour
//     renvoyer un motif de rejet honnête (`provider_not_configured`) — jamais
//     pour vérifier une signature.
//
// Pourquoi `verifyWebhook` ne vérifie AUCUNE signature (contrairement aux
// autres adaptateurs esquissés dans signature.ts) : le schéma exact de Stripe
// (`Stripe-Signature: t=<timestamp>,v1=<hmac>`, message signé =
// `<timestamp>.<corps_brut>`) n'a jamais été confirmé documentation en main
// dans cette session. `signature.ts` documente déjà le risque exact
// (ALIGN-04A.2, correction Flutterwave) : deviner un schéma de signature
// produirait un vérificateur qui a l'air correct mais ne l'est pas. Ce
// squelette refuse ce risque et rejette systématiquement, plutôt que de
// prétendre vérifier quoi que ce soit.
// =============================================================================

import type {
  BillingProviderAdapter,
  CheckoutRequest,
  CheckoutSession,
  CustomerPortalRequest,
  CustomerPortalSession,
  PaymentMethodSummary,
  PaymentOutcome,
  ProviderRef,
  ProviderSubscription,
  SubscriptionRequest,
  WebhookVerification,
} from "../provider.ts";
import type { BillingCycle } from "../model.ts";
import type { PlanSlug } from "../../entitlements/model.ts";
import { providerMode, webhookSecret } from "../provider-config.ts";

function notImplemented(operation: string): never {
  throw new Error(
    `STRIPE_SKELETON_NOT_IMPLEMENTED: "${operation}" n'est pas implémenté. ` +
      "Ce fichier est un squelette inerte (REVENUE-01F, architecture Canada " +
      "préparée mais non activée) : aucun appel réseau, aucune clé API lue. " +
      "Il ne doit jamais être enregistré via registerBillingProvider() sans " +
      "une décision explicite et distincte de REVENUE-LAUNCH-01.",
  );
}

export const stripeSkeletonAdapter: BillingProviderAdapter = {
  name: "stripe",
  // `providerMode()` renvoie toujours "sandbox" tant qu'ALIGN-04B (mise en
  // service) n'existe pas — voir provider-config.ts, isLiveModeAllowed().
  mode: providerMode(),

  // --- Obligatoire, mais volontairement inerte ------------------------------

  async createCheckout(_request: CheckoutRequest): Promise<CheckoutSession> {
    return notImplemented("createCheckout");
  },

  async verifyWebhook(
    _rawBody: string,
    _headers: Readonly<Record<string, string>>,
  ): Promise<WebhookVerification> {
    if (!webhookSecret("stripe")) return { valid: false, reason: "provider_not_configured" };
    // Un secret serait présent qu'aucune vérification réelle ne serait
    // tentée : voir la note en tête de fichier. Rejeter honnêtement plutôt
    // que de deviner un schéma de signature non confirmé.
    return { valid: false, reason: "invalid_signature" };
  },

  // --- Optionnel : la forme "abonnement + prélèvement automatique" que le
  // Canada attend, entièrement inerte ----------------------------------------

  async createSubscription(_request: SubscriptionRequest): Promise<ProviderSubscription> {
    return notImplemented("createSubscription");
  },

  async updateSubscription(
    _ref: ProviderRef,
    _plan: PlanSlug,
    _cycle: BillingCycle,
    _idempotencyKey: string,
  ): Promise<ProviderSubscription> {
    return notImplemented("updateSubscription");
  },

  async cancelSubscription(_ref: ProviderRef, _idempotencyKey: string): Promise<void> {
    return notImplemented("cancelSubscription");
  },

  async chargeRecurring(
    _ref: ProviderRef,
    _amountMinor: number,
    _idempotencyKey: string,
  ): Promise<PaymentOutcome> {
    return notImplemented("chargeRecurring");
  },

  async retryPayment(_ref: ProviderRef, _idempotencyKey: string): Promise<PaymentOutcome> {
    return notImplemented("retryPayment");
  },

  async fetchPaymentStatus(_ref: ProviderRef): Promise<PaymentOutcome> {
    return notImplemented("fetchPaymentStatus");
  },

  async fetchPaymentMethod(_ref: ProviderRef): Promise<PaymentMethodSummary> {
    return notImplemented("fetchPaymentMethod");
  },

  async refund(_ref: ProviderRef, _amountMinor: number, _idempotencyKey: string): Promise<void> {
    return notImplemented("refund");
  },

  // REVENUE-01F — portail client. Vocabulaire ajouté par ce même lot
  // (provider.ts / provider-capabilities.ts) : encore inerte partout.
  async openCustomerPortal(_request: CustomerPortalRequest): Promise<CustomerPortalSession> {
    return notImplemented("openCustomerPortal");
  },
};

// Volontairement AUCUN `registerBillingProvider(stripeSkeletonAdapter)` ici,
// ni importé/appelé ailleurs dans ce lot. Tant que cet appel n'existe nulle
// part dans le code, cet adaptateur est un fichier mort du point de vue de
// l'application : `hasConfiguredProvider()`, `getBillingProvider("stripe")`
// et tout le routage restent exactement comme avant ce fichier.
