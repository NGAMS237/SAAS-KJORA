// =============================================================================
// KJORA — Règles de traitement des webhooks provider (ALIGN-04A)
// =============================================================================
// Module PUR : décide ce qu'un événement provider a le droit de provoquer,
// sans rien exécuter. Testable sans base et sans réseau.
//
// Principe : **un webhook constate, il n'ordonne pas.**
// Le cycle de vie de l'abonnement reste celui d'ALIGN-03. Un événement
// provider ne fait que fournir la preuve de paiement qui manquait ; il ne
// choisit pas l'état suivant, il ne recalcule pas de montant, et il ne peut
// jamais faire régresser une vérité déjà établie en base.
// =============================================================================

import type { SubscriptionStatus } from "./model.ts";

/** Familles d'événements que KJORA sait interpréter. Le reste est ignoré. */
export type BillingWebhookKind =
  | "payment_succeeded"
  | "payment_failed"
  | "payment_pending"
  | "subscription_cancelled"
  | "refund_succeeded";

export const WEBHOOK_KINDS: readonly BillingWebhookKind[] = [
  "payment_succeeded", "payment_failed", "payment_pending",
  "subscription_cancelled", "refund_succeeded",
] as const;

export type WebhookDisposition =
  /** Événement déjà vu : on répond 200 sans rien refaire. */
  | { action: "ignore_duplicate" }
  /** Événement inconnu ou hors périmètre : accusé de réception, aucun effet. */
  | { action: "acknowledge_unhandled"; reason: string }
  /** Événement refusé : montant, devise ou Organization incohérents. */
  | { action: "reject"; reason: WebhookRejectReason }
  /** Événement retenu : effet précis à appliquer par la couche serveur. */
  | { action: "apply"; effect: WebhookEffect };

export type WebhookRejectReason =
  | "amount_mismatch"
  | "currency_mismatch"
  | "unknown_organization"
  | "no_pending_intent"
  | "status_transition_forbidden";

export type WebhookEffect =
  | { kind: "activate_pending_plan" }
  | { kind: "mark_payment_failed" }
  | { kind: "record_attempt_only" }
  | { kind: "mark_cancelled" }
  | { kind: "record_refund" };

export type WebhookContext = {
  /** L'événement a-t-il déjà été enregistré ? Index unique sur providerEventId. */
  alreadyProcessed: boolean;
  /** État actuel de l'abonnement, tel qu'il est en base. */
  currentStatus: SubscriptionStatus;
  /** Un changement de plan est-il en attente de preuve de paiement ? */
  pendingPlanExists: boolean;
  /** Montant attendu, calculé en base par KJORA. Jamais fourni par le provider. */
  expectedAmountMinor: number;
  expectedCurrency: string;
  /** Ce que le provider affirme avoir encaissé. */
  reportedAmountMinor: number;
  reportedCurrency: string;
  organizationKnown: boolean;
};

/**
 * Le prorata reste calculé par KJORA. Le montant annoncé par le provider ne
 * sert qu'à un contrôle de cohérence : s'il diverge, l'événement est refusé et
 * l'écart est journalisé pour traitement humain. On n'ajuste jamais la base
 * sur la parole du provider.
 */
export function amountsAgree(context: WebhookContext): boolean {
  return context.reportedAmountMinor === context.expectedAmountMinor;
}

export function decideWebhook(
  kind: BillingWebhookKind | string,
  context: WebhookContext,
): WebhookDisposition {
  // 1. Idempotence d'abord : un rejeu ne doit rien déclencher, même valide.
  if (context.alreadyProcessed) return { action: "ignore_duplicate" };

  // 2. Périmètre.
  if (!(WEBHOOK_KINDS as readonly string[]).includes(kind)) {
    return { action: "acknowledge_unhandled", reason: "event_kind_out_of_scope" };
  }
  if (!context.organizationKnown) {
    return { action: "reject", reason: "unknown_organization" };
  }

  switch (kind as BillingWebhookKind) {
    case "payment_succeeded": {
      if (!context.pendingPlanExists) {
        // Un paiement sans intention enregistrée n'active rien : il n'existe
        // aucune demande à honorer, et deviner en serait une invention.
        return { action: "reject", reason: "no_pending_intent" };
      }
      if (context.reportedCurrency !== context.expectedCurrency) {
        return { action: "reject", reason: "currency_mismatch" };
      }
      if (!amountsAgree(context)) {
        return { action: "reject", reason: "amount_mismatch" };
      }
      if (context.currentStatus === "cancelled") {
        return { action: "reject", reason: "status_transition_forbidden" };
      }
      return { action: "apply", effect: { kind: "activate_pending_plan" } };
    }

    case "payment_failed":
      return { action: "apply", effect: { kind: "mark_payment_failed" } };

    case "payment_pending":
      // Une tentative est journalisée ; aucun état d'abonnement ne bouge.
      return { action: "apply", effect: { kind: "record_attempt_only" } };

    case "subscription_cancelled":
      return { action: "apply", effect: { kind: "mark_cancelled" } };

    case "refund_succeeded":
      return { action: "apply", effect: { kind: "record_refund" } };
  }
}

/** Seul `activate_pending_plan` touche au plan effectif. Vérifié par test. */
export function effectActivatesPlan(effect: WebhookEffect): boolean {
  return effect.kind === "activate_pending_plan";
}

/**
 * Clé d'idempotence d'une demande sortante. Déterministe : la même demande
 * logique produit toujours la même clé, donc jamais deux débits.
 */
export function buildIdempotencyKey(parts: {
  organizationId: string;
  plan: string;
  cycle: string;
  amountMinor: number;
  /** Identifiant de l'intention en base — distingue deux demandes identiques. */
  intentId: string;
}): string {
  return [
    "kjora", parts.organizationId, parts.plan, parts.cycle,
    String(parts.amountMinor), parts.intentId,
  ].join(":");
}
