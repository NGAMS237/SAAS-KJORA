// =============================================================================
// KJORA — Matrice de capacités des providers de paiement (ALIGN-04A)
// =============================================================================
// Module PUR. Aucune clé, aucun secret, aucun appel réseau, aucun `server-only`.
// Il décrit ce que chaque provider sait faire — pas comment le faire.
//
// Principe directeur : l'interface n'oblige personne à tout supporter.
// Un provider déclare ses capacités ; le routage serveur ne lui demande que
// ce qu'il a déclaré. Une opération non déclarée n'est pas un échec au
// moment de l'appel, c'est une exclusion au moment du choix.
//
// Toute valeur tarifaire est absente d'ici volontairement : les tarifs ne sont
// pas publics pour la majorité des providers retenus. Voir
// docs/product/KJORA-PAYMENT-PROVIDERS-COMPARISON-v0.1.md.
// =============================================================================

import type { BillingCurrency } from "./model.ts";
import type { RecurrenceMode } from "./types.ts";

export type ProviderName = "stripe" | "campay" | "flutterwave" | "payunit" | "elyonpay" | "notchpay";

export const PROVIDER_NAMES: readonly ProviderName[] = [
  "stripe", "campay", "flutterwave", "payunit", "elyonpay", "notchpay",
] as const;

export function isProviderName(value: unknown): value is ProviderName {
  return typeof value === "string" && (PROVIDER_NAMES as readonly string[]).includes(value);
}

/** Les 10 opérations du contrat. Aucun provider n'est tenu de toutes les offrir. */
export type ProviderOperation =
  | "createCheckout"
  | "createSubscription"
  | "updateSubscription"
  | "cancelSubscription"
  | "chargeRecurring"
  | "retryPayment"
  | "fetchPaymentStatus"
  | "fetchPaymentMethod"
  | "verifyWebhook"
  | "refund";

export const PROVIDER_OPERATIONS: readonly ProviderOperation[] = [
  "createCheckout", "createSubscription", "updateSubscription", "cancelSubscription",
  "chargeRecurring", "retryPayment", "fetchPaymentStatus", "fetchPaymentMethod",
  "verifyWebhook", "refund",
] as const;

export type PaymentMethodKind = "card" | "mtn_momo" | "orange_money" | "bank_transfer" | "other_wallet";

/** Deux seules opérations sont exigées de tout adaptateur retenu. */
export const REQUIRED_OPERATIONS: readonly ProviderOperation[] = [
  "createCheckout",
  "verifyWebhook",
] as const;

export type ProviderStatus =
  | "selected"      // retenu, adaptateur à construire
  | "reserve"       // viable, non intégré
  | "rejected";     // écarté, avec motif

export type ProviderCapabilities = {
  readonly name: ProviderName;
  readonly label: string;
  readonly status: ProviderStatus;
  /** Le marchand STE VERALUZ SARL (Cameroun) peut-il détenir un compte ? */
  readonly merchantEligibleCameroon: boolean;
  readonly currencies: readonly BillingCurrency[];
  readonly methods: readonly PaymentMethodKind[];
  readonly operations: readonly ProviderOperation[];
  readonly recurrence: readonly RecurrenceMode[];
  /** Signature de webhook vérifiable ? Sans elle, aucun événement n'est cru. */
  readonly signedWebhooks: boolean;
  /** Le provider expose-t-il un environnement de test isolé ? */
  readonly sandbox: boolean;
  /** Point qui doit être confirmé par le provider avant activation commerciale. */
  readonly needsConfirmation: readonly string[];
  readonly note: string;
};

// ---------------------------------------------------------------------------
// La matrice
// ---------------------------------------------------------------------------

export const PROVIDER_CAPABILITIES: Record<ProviderName, ProviderCapabilities> = {
  flutterwave: {
    name: "flutterwave",
    label: "Flutterwave",
    status: "selected",
    merchantEligibleCameroon: true,
    currencies: ["XAF", "CAD"],
    methods: ["card", "mtn_momo", "orange_money", "bank_transfer"],
    operations: [
      "createCheckout", "createSubscription", "cancelSubscription",
      "chargeRecurring", "retryPayment", "fetchPaymentStatus",
      "fetchPaymentMethod", "verifyWebhook",
    ],
    recurrence: ["unattended", "customer_approved"],
    signedWebhooks: true,
    sandbox: true,
    needsConfirmation: [
      "Grille tarifaire marchand camerounais",
      "Conditions d'activation du mandat MoMo récurrent",
      "Politique de remboursement (partiel / total / délai)",
      "Règlement : tout est converti en XAF, sans conversion sortante possible",
    ],
    note:
      "Provider primaire. Seul provider trouvé à la fois licencié au Cameroun et " +
      "capable d'encaisser des cartes internationales (Canada, diaspora). " +
      "updateSubscription non déclaré : un changement de plan passe par annulation " +
      "puis nouvelle souscription, pilotée par KJORA.",
  },

  campay: {
    name: "campay",
    label: "CamPay",
    status: "selected",
    merchantEligibleCameroon: true,
    currencies: ["XAF"],
    methods: ["mtn_momo", "orange_money"],
    operations: [
      "createCheckout", "cancelSubscription", "retryPayment",
      "fetchPaymentStatus", "verifyWebhook",
    ],
    recurrence: ["customer_approved"],
    signedWebhooks: true,
    sandbox: true,
    needsConfirmation: [
      "Grille tarifaire",
      "Activation des abonnements MoMo mensuels (disponibles sur demande)",
      "Existence et modalités d'un remboursement",
    ],
    note:
      "Spécialiste Mobile Money camerounais. Webhooks signés HMAC-SHA256 et " +
      "idempotence garantie par le provider. Aucune carte, aucune devise autre " +
      "que le XAF. Le prélèvement silencieux n'est pas acquis : mode " +
      "customer_approved par défaut.",
  },

  elyonpay: {
    name: "elyonpay",
    label: "ElyonPay",
    status: "selected",
    merchantEligibleCameroon: true,
    currencies: ["XAF"],
    methods: ["mtn_momo", "orange_money", "card", "other_wallet"],
    operations: ["createCheckout", "fetchPaymentStatus", "verifyWebhook"],
    recurrence: ["customer_approved"],
    signedWebhooks: false,
    sandbox: true,
    needsConfirmation: [
      "Signature des webhooks : mécanisme exact",
      "Support du paiement récurrent",
      "Politique de remboursement",
    ],
    note:
      "Fallback camerounais. Seul provider de la sélection à publier une " +
      "fourchette tarifaire (2,5–3 %). signedWebhooks reste false tant que le " +
      "mécanisme n'est pas documenté : sans signature vérifiable, aucun " +
      "événement ne peut activer quoi que ce soit.",
  },

  notchpay: {
    name: "notchpay",
    label: "Notch Pay",
    status: "reserve",
    merchantEligibleCameroon: true,
    currencies: ["XAF"],
    methods: ["mtn_momo", "orange_money", "card"],
    operations: ["createCheckout", "fetchPaymentStatus", "verifyWebhook"],
    recurrence: ["customer_approved"],
    signedWebhooks: true,
    sandbox: true,
    needsConfirmation: ["Grille tarifaire", "Support du paiement récurrent"],
    note:
      "Viable mais redondant avec CamPay et ElyonPay. Conservé en réserve " +
      "documentée, aucun adaptateur construit.",
  },

  stripe: {
    name: "stripe",
    label: "Stripe",
    status: "rejected",
    merchantEligibleCameroon: false,
    currencies: ["XAF", "CAD"],
    methods: ["card"],
    operations: [
      "createCheckout", "createSubscription", "updateSubscription",
      "cancelSubscription", "chargeRecurring", "retryPayment",
      "fetchPaymentStatus", "fetchPaymentMethod", "verifyWebhook", "refund",
    ],
    recurrence: ["unattended"],
    signedWebhooks: true,
    sandbox: true,
    needsConfirmation: [],
    note:
      "Techniquement le plus complet, et écarté malgré cela : le Cameroun ne " +
      "figure pas parmi les pays où un marchand peut ouvrir un compte. " +
      "STE VERALUZ SARL ne peut donc pas être le marchand encaisseur (D-143). " +
      "À réexaminer uniquement si une entité étrangère était créée et canonisée.",
  },

  payunit: {
    name: "payunit",
    label: "PayUnit",
    status: "rejected",
    merchantEligibleCameroon: false,
    currencies: [],
    methods: [],
    operations: [],
    recurrence: [],
    signedWebhooks: false,
    sandbox: false,
    needsConfirmation: [
      "Marchés couverts",
      "Devises supportées",
      "Moyens de paiement",
      "Mécanisme de webhook et signature",
      "Support du récurrent",
      "Grille tarifaire",
    ],
    note:
      "Non retenu par absence de documentation publique fiable. Les capacités " +
      "sont déclarées vides plutôt que devinées : ce fichier ne suppose rien. " +
      "merchantEligibleCameroon est false faute de preuve, pas par constat " +
      "contraire.",
  },
};

// ---------------------------------------------------------------------------
// Lecture de la matrice
// ---------------------------------------------------------------------------

export function supportsOperation(name: ProviderName, operation: ProviderOperation): boolean {
  return PROVIDER_CAPABILITIES[name].operations.includes(operation);
}

export function supportsCurrency(name: ProviderName, currency: BillingCurrency): boolean {
  return PROVIDER_CAPABILITIES[name].currencies.includes(currency);
}

export function supportsRecurrence(name: ProviderName, mode: RecurrenceMode): boolean {
  return PROVIDER_CAPABILITIES[name].recurrence.includes(mode);
}

/**
 * Un provider est intégrable si, et seulement si :
 *  – il est retenu ;
 *  – le marchand camerounais peut détenir un compte ;
 *  – il offre les opérations minimales ;
 *  – ses webhooks sont vérifiables.
 *
 * La dernière condition n'est pas négociable : sans signature vérifiable,
 * un événement entrant est une affirmation non authentifiée, et une
 * affirmation non authentifiée n'active jamais un plan.
 */
export function isIntegrable(name: ProviderName): boolean {
  const c = PROVIDER_CAPABILITIES[name];
  return (
    c.status === "selected" &&
    c.merchantEligibleCameroon &&
    c.signedWebhooks &&
    REQUIRED_OPERATIONS.every((op) => c.operations.includes(op))
  );
}

/** Le meilleur mode de récurrence que ce provider sache tenir. */
export function bestRecurrence(name: ProviderName): RecurrenceMode | null {
  const modes = PROVIDER_CAPABILITIES[name].recurrence;
  if (modes.includes("unattended")) return "unattended";
  if (modes.includes("customer_approved")) return "customer_approved";
  return null;
}

/**
 * Le Mobile Money et les wallets d'Afrique centrale n'existent qu'en XAF.
 * Déclarer une devise et un moyen séparément ne suffit donc pas : leur
 * croisement doit rester cohérent, sinon le routage proposerait un règlement
 * en dollars canadiens par MTN MoMo — combinaison qui n'existe pas.
 */
const XAF_ONLY_METHODS: readonly PaymentMethodKind[] = [
  "mtn_momo", "orange_money", "bank_transfer", "other_wallet",
];

export function methodAvailableIn(
  method: PaymentMethodKind,
  currency: BillingCurrency,
): boolean {
  return XAF_ONLY_METHODS.includes(method) ? currency === "XAF" : true;
}

export function providersFor(
  currency: BillingCurrency,
  method: PaymentMethodKind | null,
): ProviderName[] {
  if (method !== null && !methodAvailableIn(method, currency)) return [];
  return PROVIDER_NAMES.filter((name) => {
    if (!isIntegrable(name)) return false;
    if (!supportsCurrency(name, currency)) return false;
    if (method !== null && !PROVIDER_CAPABILITIES[name].methods.includes(method)) return false;
    return true;
  });
}
