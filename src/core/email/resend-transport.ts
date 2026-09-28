// =============================================================================
// KJORA — Transport Resend unique (NOTIFICATIONS-COMMUNICATIONS-E2E-01 v2)
// =============================================================================
// Module PUR : `fetch` et la clé sont injectés (aucune lecture d'environnement
// ici, aucun `server-only` : testable par Node avec un faux fetch). Réutilisé
// par les deux files (loyers, SaaS) — un seul transport, une seule
// configuration (RESEND_TRANSACTIONAL_API_KEY, KJORA_TRANSACTIONAL_EMAIL_FROM).
//
// Classement EXPLICITE de chaque réponse :
//   ok         identifiant de message reçu : envoi accepté ;
//   retryable  refus CERTAIN, rien n'a été accepté (429) : relançable ;
//   terminal   refus CERTAIN et définitif (400/401/403/404/422…) ;
//   ambiguous  issue INCONNUE — délai dépassé, coupure réseau, 5xx, 409
//              (requête idempotente concurrente), 2xx sans identifiant.
//              Le fournisseur a PU accepter : l'appelant ne relance jamais
//              automatiquement, la ligne passe en revue Admin.
//
// Idempotency-Key : déterministe (ligne + génération). Protection
// SUPPLÉMENTAIRE seulement : Resend l'oublie après 24 h, et un cron quotidien
// peut reprendre au-delà. La garantie anti-doublon repose sur l'état
// 'delivery_unknown' en base, pas sur cette clé.
//
// Erreurs : un code court et stable, jamais le texte de la réponse
// fournisseur ni la clé.
// =============================================================================

export const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

export type EmailAttachment = { filename: string; contentBase64: string };

export type TransactionalEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Étiquettes non sensibles (file, gabarit, référence de ligne), jamais une adresse. */
  tags?: Array<{ name: string; value: string }>;
};

export type FailureKind = "retryable" | "terminal" | "ambiguous";

export type SendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; kind: FailureKind; code: string };

export type EmailTransport = {
  send(message: TransactionalEmail, idempotencyKey: string): Promise<SendOutcome>;
};

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_\-]{8,256}$/;
const TAG = /^[A-Za-z0-9_\-]{1,256}$/;

/**
 * Clé d'idempotence déterministe d'une ligne de file et de sa génération.
 * Une ré-expédition décidée par un Admin change de génération, donc de clé.
 */
export function deliveryIdempotencyKey(queue: "rent" | "saas", deliveryId: string, generation = 0): string {
  const safeGeneration = Number.isInteger(generation) && generation > 0 ? generation : 0;
  return safeGeneration === 0 ? `kjora-${queue}-${deliveryId}` : `kjora-${queue}-${deliveryId}-r${safeGeneration}`;
}

/**
 * Étiquette de rapprochement webhook → ligne ET génération :
 * « rent_<uuid>_g0 », « rent_<uuid>_g1 », « saas_<uuid>_g0 »…
 * Un webhook retardé d'une génération antérieure ne peut donc jamais lever
 * la revue d'une génération plus récente.
 */
export function deliveryReferenceTag(
  queue: "rent" | "saas",
  deliveryId: string,
  resendGeneration: number,
): { name: string; value: string } {
  const generation = Number.isInteger(resendGeneration) && resendGeneration >= 0 && resendGeneration <= 20 ? resendGeneration : 0;
  return { name: "kjora_delivery", value: `${queue}_${deliveryId}_g${generation}` };
}

/** Classement d'un statut HTTP non 2xx. */
export function classifyResendStatus(status: number): { kind: FailureKind; code: string } {
  // 429 : limite de débit — la requête a été REFUSÉE, rien n'a été accepté.
  if (status === 429) return { kind: "retryable", code: "resend_429" };
  // 409 : une requête de même clé est en cours ou a abouti — issue inconnue.
  if (status === 409) return { kind: "ambiguous", code: "resend_409" };
  // 5xx : le fournisseur a pu traiter la requête avant d'échouer — inconnu.
  if (status >= 500) return { kind: "ambiguous", code: `resend_${status}` };
  // Autres 4xx : message ou configuration invalides — refus définitif.
  return { kind: "terminal", code: `resend_${status}` };
}

export function createResendTransport(options: {
  apiKey: string;
  fetchImpl?: FetchLike;
  endpoint?: string;
  timeoutMs?: number;
}): EmailTransport {
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const endpoint = options.endpoint ?? RESEND_EMAILS_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!apiKey) throw new Error("resend_api_key_missing");

  return {
    async send(message, idempotencyKey) {
      // Rejeté AVANT tout appel : rien n'a pu être accepté.
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) return { ok: false, kind: "terminal", code: "invalid_idempotency_key" };
      const body: Record<string, unknown> = {
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      };
      if (message.attachments?.length) {
        body.attachments = message.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.contentBase64,
        }));
      }
      const tags = (message.tags ?? []).filter((tag) => TAG.test(tag.name) && TAG.test(tag.value));
      if (tags.length) body.tags = tags;

      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(body),
          signal: controller?.signal,
        });
      } catch (error) {
        // Délai dépassé ou coupure : la requête a pu partir et être acceptée.
        const aborted = error instanceof Error && error.name === "AbortError";
        return { ok: false, kind: "ambiguous", code: aborted ? "provider_timeout" : "network_error" };
      } finally {
        if (timer) clearTimeout(timer);
      }
      const payload = await response.json().catch(() => ({})) as { id?: unknown };
      if (response.ok && typeof payload.id === "string" && payload.id.length > 0 && payload.id.length <= 200) {
        return { ok: true, providerMessageId: payload.id };
      }
      // 2xx sans identifiant exploitable : acceptation possible, non prouvée.
      if (response.ok) return { ok: false, kind: "ambiguous", code: "resend_missing_id" };
      return { ok: false, ...classifyResendStatus(response.status) };
    },
  };
}
