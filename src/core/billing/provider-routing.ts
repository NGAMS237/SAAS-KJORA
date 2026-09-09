// =============================================================================
// KJORA — Routage provider (ALIGN-04A)
// =============================================================================
// Module PUR et déterministe. Décide QUEL provider sert une demande donnée.
//
// Règle non négociable : **le serveur décide**. Le navigateur peut exprimer une
// préférence de moyen de paiement (« je veux payer par MTN MoMo »), jamais un
// nom de provider. Une préférence non reconnue est ignorée en silence, elle
// n'est jamais une erreur exploitable et n'élargit jamais le choix.
//
// Ce module ne lit aucun secret et n'appelle rien. Il reçoit la liste des
// providers réellement configurés — établie côté serveur — et tranche.
// =============================================================================

import type { BillingCurrency, BillingCycle } from "./model.ts";
import type { PlanSlug } from "../entitlements/model.ts";
import type {
  BillingCheckoutAffordance,
  CheckoutUnavailableReason,
  RecurrenceMode,
} from "./types.ts";
import {
  PROVIDER_CAPABILITIES,
  bestRecurrence,
  isIntegrable,
  isProviderName,
  methodAvailableIn,
  supportsCurrency,
  type PaymentMethodKind,
  type ProviderName,
} from "./provider-capabilities.ts";

/**
 * Ordre de préférence, décidé une fois pour toutes et documenté.
 * Flutterwave d'abord : c'est le seul à couvrir cartes internationales et
 * Mobile Money. CamPay ensuite pour le MoMo local. ElyonPay en secours.
 */
export const ROUTING_ORDER: readonly ProviderName[] = [
  "flutterwave", "campay", "elyonpay",
] as const;

/** Pour un paiement MoMo local en XAF, le spécialiste passe devant. */
export const MOMO_ROUTING_ORDER: readonly ProviderName[] = [
  "campay", "flutterwave", "elyonpay",
] as const;

const MOMO_METHODS: readonly PaymentMethodKind[] = ["mtn_momo", "orange_money"];

export type RoutingInput = {
  plan: PlanSlug;
  cycle: BillingCycle;
  currency: BillingCurrency;
  amountMinor: number;
  /** Providers dont les secrets sont réellement présents côté serveur. */
  configured: readonly ProviderName[];
  /** Préférence de moyen de paiement venant du client. Jamais un provider. */
  methodHint?: unknown;
};

export type RoutingDecision =
  | {
      routed: true;
      provider: ProviderName;
      method: PaymentMethodKind | null;
      recurrence: RecurrenceMode;
      /** Providers de repli, dans l'ordre, si le premier échoue. */
      fallbacks: ProviderName[];
    }
  | { routed: false; reason: CheckoutUnavailableReason };

const METHOD_KINDS: readonly PaymentMethodKind[] = [
  "card", "mtn_momo", "orange_money", "bank_transfer", "other_wallet",
];

/**
 * Normalise la préférence du client. Tout ce qui n'est pas exactement un
 * moyen de paiement connu devient `null` — y compris un nom de provider,
 * précisément pour qu'un client ne puisse pas en imposer un.
 */
export function normalizeMethodHint(value: unknown): PaymentMethodKind | null {
  if (typeof value !== "string") return null;
  if (isProviderName(value)) return null;
  return (METHOD_KINDS as readonly string[]).includes(value)
    ? (value as PaymentMethodKind)
    : null;
}

export function routeProvider(input: RoutingInput): RoutingDecision {
  if (input.plan === "decouverte" || input.amountMinor <= 0) {
    return { routed: false, reason: "plan_is_free" };
  }
  if (input.plan === "sur_mesure") {
    return { routed: false, reason: "plan_requires_quote" };
  }

  const hinted = normalizeMethodHint(input.methodHint);
  // Une préférence impossible dans cette devise (MoMo en CAD) est écartée ici,
  // avant tout choix de provider.
  const method = hinted !== null && methodAvailableIn(hinted, input.currency) ? hinted : null;
  const order = method !== null && MOMO_METHODS.includes(method)
    ? MOMO_ROUTING_ORDER
    : ROUTING_ORDER;

  // Un provider n'est éligible que s'il est intégrable ET réellement configuré.
  const eligible = order.filter(
    (name) => isIntegrable(name) && input.configured.includes(name),
  );

  if (eligible.length === 0) {
    // Distinguer « rien de configuré » de « configuré mais pas pour cette devise »
    const anyForCurrency = order.some(
      (name) => isIntegrable(name) && supportsCurrency(name, input.currency),
    );
    return {
      routed: false,
      reason: anyForCurrency ? "no_provider_configured" : "currency_unsupported",
    };
  }

  const byCurrency = eligible.filter((name) => supportsCurrency(name, input.currency));
  if (byCurrency.length === 0) {
    return { routed: false, reason: "currency_unsupported" };
  }

  const byMethod = method === null
    ? byCurrency
    : byCurrency.filter((name) => PROVIDER_CAPABILITIES[name].methods.includes(method));

  // Une préférence impossible n'est pas une erreur : on sert le client
  // autrement plutôt que de le bloquer sur son propre choix.
  const retained = byMethod.length > 0 ? byMethod : byCurrency;
  const [provider, ...fallbacks] = retained;

  return {
    routed: true,
    provider,
    method: byMethod.length > 0 ? method : null,
    recurrence: bestRecurrence(provider) ?? "customer_approved",
    fallbacks,
  };
}

/** Ce que l'interface a le droit de savoir. Ne révèle jamais le provider retenu. */
export function affordanceFor(decision: RoutingDecision): BillingCheckoutAffordance {
  return decision.routed
    ? { online: true, recurrence: decision.recurrence, reason: null }
    : { online: false, recurrence: null, reason: decision.reason };
}
