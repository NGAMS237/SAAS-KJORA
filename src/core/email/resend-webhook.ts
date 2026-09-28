// =============================================================================
// KJORA — Vérification des webhooks Resend (signature Svix)
// =============================================================================
// Module PUR (node:crypto uniquement). Resend signe ses webhooks au format
// Svix : en-têtes `svix-id`, `svix-timestamp`, `svix-signature` ; signature =
// base64(HMAC-SHA256(secret, `${id}.${timestamp}.${corps brut}`)), secret =
// partie base64 de `whsec_…` (variable RESEND_WEBHOOK_SECRET).
//
//   • corps BRUT vérifié avant tout parsing ;
//   • comparaison en temps constant ;
//   • fenêtre de fraîcheur de 5 minutes (rejeu d'un vieil événement refusé) ;
//   • plusieurs signatures possibles (rotation de secret) : une seule valide suffit.
// Seuls l'identifiant d'événement, son type, l'identifiant de message et la
// date sont extraits : jamais l'adresse, le sujet ni le contenu.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "invalid_secret" | "stale_timestamp" | "invalid_signature" };

function secretBytes(secret: string): Buffer | null {
  const value = secret.trim();
  const encoded = value.startsWith("whsec_") ? value.slice("whsec_".length) : value;
  if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length >= 16 ? bytes : null;
}

export function signWebhookPayload(secret: string, id: string, timestamp: string, rawBody: string): string {
  const key = secretBytes(secret);
  if (!key) throw new Error("invalid_webhook_secret");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
}

export function verifyResendWebhook(
  secret: string | undefined | null,
  headers: WebhookHeaders,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): WebhookVerification {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing_headers" };
  const key = secret ? secretBytes(secret) : null;
  if (!key) return { ok: false, reason: "invalid_secret" };
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = Buffer.from(
    createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64"),
  );
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    const candidate = Buffer.from(value);
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: "invalid_signature" };
}

/**
 * Classement EXPLICITE des événements Resend traités :
 *   terminalSuccess : delivered ;
 *   terminalFailure : failed, bounced, complained, suppressed — jamais « livré »,
 *                     jamais ré-expédiés automatiquement ;
 *   information     : sent (lève une revue par preuve d'acceptation),
 *                     delivery_delayed (enregistré, aucune ré-expédition).
 * Aucun événement n'est « relançable » : une relance automatique ne naît que
 * d'un refus certain à l'envoi (429) ou d'un échec avant envoi, jamais d'un
 * webhook.
 */
export const RESEND_EVENT_CLASSES = {
  "email.delivered": "terminal_success",
  "email.failed": "terminal_failure",
  "email.bounced": "terminal_failure",
  "email.complained": "terminal_failure",
  "email.suppressed": "terminal_failure",
  "email.sent": "information",
  "email.delivery_delayed": "information",
} as const;

export type HandledResendEvent = keyof typeof RESEND_EVENT_CLASSES;

export const HANDLED_RESEND_EVENTS = Object.keys(RESEND_EVENT_CLASSES) as HandledResendEvent[];

export function isHandledResendEvent(value: unknown): value is HandledResendEvent {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RESEND_EVENT_CLASSES, value);
}

/** Référence de ligne portée par l'étiquette kjora_delivery. */
export type DeliveryReference = {
  queue: "rent" | "saas";
  deliveryId: string;
  resendGeneration: number;
};

export type ResendEventSummary = {
  type: string;
  providerMessageId: string | null;
  occurredAt: string | null;
  /** Étiquette « <file>_<uuid>_g<génération> » posée à l'envoi, si présente et valide. */
  deliveryRef: DeliveryReference | null;
};

const DELIVERY_REF = /^(rent|saas)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_g(0|[1-9][0-9]?)$/;

/**
 * Analyse une valeur d'étiquette. Toute valeur malformée, ou sans
 * génération (ancien format), est ignorée : l'événement ne pourra alors être
 * rapproché que par identifiant fournisseur exact.
 */
export function parseDeliveryReference(value: unknown): DeliveryReference | null {
  if (typeof value !== "string") return null;
  const match = DELIVERY_REF.exec(value);
  if (!match) return null;
  const generation = Number(match[3]);
  if (!Number.isInteger(generation) || generation > 20) return null;
  return { queue: match[1] as "rent" | "saas", deliveryId: match[2], resendGeneration: generation };
}

function extractDeliveryRef(tags: unknown): DeliveryReference | null {
  let value: unknown = null;
  if (Array.isArray(tags)) {
    const tag = tags.find((item) => item && typeof item === "object" && (item as { name?: unknown }).name === "kjora_delivery");
    value = tag ? (tag as { value?: unknown }).value : null;
  } else if (tags && typeof tags === "object") {
    value = (tags as Record<string, unknown>).kjora_delivery;
  }
  return parseDeliveryReference(value);
}

/** Extrait le strict nécessaire d'un événement vérifié (jamais adresse ni contenu). */
export function summarizeResendEvent(payload: unknown): ResendEventSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; created_at?: unknown; tags?: unknown } };
  if (typeof value.type !== "string" || value.type.length > 80) return null;
  const messageId = typeof value.data?.email_id === "string" && value.data.email_id.length <= 200 ? value.data.email_id : null;
  const occurred = typeof value.created_at === "string" ? value.created_at
    : typeof value.data?.created_at === "string" ? value.data.created_at : null;
  return {
    type: value.type,
    providerMessageId: messageId,
    occurredAt: occurred && !Number.isNaN(Date.parse(occurred)) ? new Date(occurred).toISOString() : null,
    deliveryRef: extractDeliveryRef(value.data?.tags),
  };
}
