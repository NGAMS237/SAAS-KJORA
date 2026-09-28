// =============================================================================
// KJORA — Worker des courriels transactionnels (NOTIFICATIONS-COMMUNICATIONS-E2E-01 v2)
// =============================================================================
// Module PUR : la base (RPC), le rendu des messages et le transport sont
// injectés — testable sans réseau ni base.
//
// GARANTIE (et seulement celle-ci) : AU PLUS UNE tentative d'expédition
// AUTOMATIQUE susceptible d'avoir été acceptée par le fournisseur, par ligne et
// par génération. Ce n'est PAS du « exactly-once ».
//   1. Réservation atomique (claim_* : FOR UPDATE SKIP LOCKED, jeton).
//   2. Rendu (PDF…) : un échec ici n'a rien envoyé → relançable sans risque.
//   3. markSending : point de non-retour écrit en base JUSTE AVANT l'appel
//      fournisseur. S'il échoue, on n'appelle pas le fournisseur.
//   4. Appel fournisseur, puis selon le classement du transport :
//        ok         → complete (identifiant fournisseur) ;
//        retryable  → fail(retryable) : refus certain (429) ;
//        terminal   → fail(définitif) ;
//        ambiguous  → markUnknown : revue Admin, AUCUNE relance automatique.
//      Si complete échoue après une acceptation — y compris parce que
//      l'identifiant fournisseur appartient déjà à une autre ligne (v4) —,
//      la ligne passe aussi en revue (finalization_failed) ; à défaut d'écriture possible, le bail
//      expiré la fera passer en revue (send_started_at posé), jamais en
//      nouvelle expédition.
//   5. L'Idempotency-Key (ligne + génération) n'est qu'une protection de plus :
//      Resend l'oublie après 24 h.
// Temps et nombre de lots bornés : compatible avec une fonction Vercel
// quotidienne (plan Hobby). Les relances « 5/30/120 min » ne sont que des
// délais MINIMAUX : elles partent au prochain passage quotidien ou sur
// déclenchement Admin.
// =============================================================================

import {
  deliveryIdempotencyKey,
  deliveryReferenceTag,
  type EmailTransport,
  type TransactionalEmail,
} from "../../core/email/resend-transport.ts";

export type QueueName = "rent" | "saas";

export type ClaimedDelivery = {
  id: string;
  claimToken: string;
  attemptCount: number;
  resendGeneration: number;
};

/** Résultat du rendu d'une ligne réservée. */
export type RenderOutcome =
  | { kind: "send"; message: Omit<TransactionalEmail, "from"> }
  | { kind: "cancel"; reason: string }
  | { kind: "hold"; reason: "legal_identity_missing" };

export type QueueAdapter<T extends ClaimedDelivery> = {
  claim(batchSize: number): Promise<T[]>;
  render(delivery: T): Promise<RenderOutcome>;
  markSending(delivery: T): Promise<boolean>;
  complete(delivery: T, providerMessageId: string): Promise<boolean>;
  fail(delivery: T, code: string, retryable: boolean): Promise<boolean>;
  markUnknown(delivery: T, code: string): Promise<boolean>;
  cancel(delivery: T, reason: string): Promise<boolean>;
  /** File SaaS uniquement. */
  hold?(delivery: T, reason: "legal_identity_missing"): Promise<boolean>;
};

export type QueueSummary = {
  claimed: number;
  sent: number;
  failed: number;
  cancelled: number;
  held: number;
  /** Issue inconnue → revue Admin. */
  unknown: number;
  staleTokens: number;
};

export type WorkerSummary = {
  rent: QueueSummary;
  saas: QueueSummary;
  stoppedBy: "empty" | "deadline" | "max_batches";
};

export type WorkerOptions = {
  from: string;
  transport: EmailTransport;
  rent: QueueAdapter<ClaimedDelivery>;
  saas: QueueAdapter<ClaimedDelivery>;
  batchSize?: number;
  maxBatchesPerQueue?: number;
  /** Échéance absolue (ms epoch) : aucun nouveau lot réservé après. */
  deadline?: number;
  now?: () => number;
};

function emptySummary(): QueueSummary {
  return { claimed: 0, sent: 0, failed: 0, cancelled: 0, held: 0, unknown: 0, staleTokens: 0 };
}

/** Code d'erreur interne sûr (jamais un message libre ni une valeur secrète). */
export function safeErrorCode(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "render_failed";
  const code = raw.toLowerCase().replace(/[^a-z0-9_:.\-]/g, "_").slice(0, 60);
  return /^[a-z][a-z0-9_:.\-]*$/.test(code) ? code : "render_failed";
}

async function safely(call: () => Promise<boolean>): Promise<boolean> {
  try { return await call(); } catch { return false; }
}

async function processOne<T extends ClaimedDelivery>(
  queue: QueueName,
  adapter: QueueAdapter<T>,
  delivery: T,
  options: WorkerOptions,
  summary: QueueSummary,
) {
  // 2. Rendu — rien n'est encore parti.
  let outcome: RenderOutcome;
  try {
    outcome = await adapter.render(delivery);
  } catch (error) {
    if (await safely(() => adapter.fail(delivery, `render:${safeErrorCode(error)}`, true))) summary.failed += 1;
    else summary.staleTokens += 1;
    return;
  }

  if (outcome.kind === "cancel") {
    if (await safely(() => adapter.cancel(delivery, outcome.reason))) summary.cancelled += 1; else summary.staleTokens += 1;
    return;
  }
  if (outcome.kind === "hold") {
    const done = adapter.hold
      ? await safely(() => adapter.hold!(delivery, outcome.reason))
      : await safely(() => adapter.cancel(delivery, "hold_unsupported"));
    if (done) { if (adapter.hold) summary.held += 1; else summary.cancelled += 1; } else summary.staleTokens += 1;
    return;
  }

  // 3. Point de non-retour, écrit AVANT l'appel fournisseur.
  if (!(await safely(() => adapter.markSending(delivery)))) {
    summary.staleTokens += 1;
    return;
  }

  // 4. Appel fournisseur (une seule fois, jamais relancé dans ce passage).
  const message: TransactionalEmail = {
    ...outcome.message,
    from: options.from,
    tags: [...(outcome.message.tags ?? []), deliveryReferenceTag(queue, delivery.id, delivery.resendGeneration)],
  };
  let result;
  try {
    result = await options.transport.send(message, deliveryIdempotencyKey(queue, delivery.id, delivery.resendGeneration));
  } catch {
    result = { ok: false as const, kind: "ambiguous" as const, code: "transport_exception" };
  }

  if (result.ok) {
    let completed = false;
    try { completed = await adapter.complete(delivery, result.providerMessageId); } catch { completed = false; }
    if (completed) { summary.sent += 1; return; }
    // Accepté par le fournisseur mais non enregistré : revue, jamais renvoi.
    if (await safely(() => adapter.markUnknown(delivery, "finalization_failed"))) summary.unknown += 1;
    else summary.staleTokens += 1;
    return;
  }
  if (result.kind === "ambiguous") {
    if (await safely(() => adapter.markUnknown(delivery, result.code))) summary.unknown += 1; else summary.staleTokens += 1;
    return;
  }
  if (await safely(() => adapter.fail(delivery, result.code, result.kind === "retryable"))) summary.failed += 1;
  else summary.staleTokens += 1;
}

async function drainQueue(
  queue: QueueName,
  adapter: QueueAdapter<ClaimedDelivery>,
  options: WorkerOptions,
): Promise<{ summary: QueueSummary; stoppedBy: WorkerSummary["stoppedBy"] }> {
  const summary = emptySummary();
  const batchSize = Math.min(Math.max(options.batchSize ?? 5, 1), 25);
  const maxBatches = Math.min(Math.max(options.maxBatchesPerQueue ?? 4, 1), 20);
  const now = options.now ?? Date.now;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (options.deadline !== undefined && now() >= options.deadline) return { summary, stoppedBy: "deadline" };
    const deliveries = await adapter.claim(batchSize);
    if (deliveries.length === 0) return { summary, stoppedBy: "empty" };
    summary.claimed += deliveries.length;
    // Séquentiel : débit modeste, aucune rafale vers le fournisseur.
    for (const delivery of deliveries) await processOne(queue, adapter, delivery, options, summary);
  }
  return { summary, stoppedBy: "max_batches" };
}

export async function drainEmailQueues(options: WorkerOptions): Promise<WorkerSummary> {
  if (!options.from.trim()) throw new Error("email_sender_missing");
  const rent = await drainQueue("rent", options.rent, options);
  const saas = await drainQueue("saas", options.saas, options);
  const stoppedBy = rent.stoppedBy === "deadline" || saas.stoppedBy === "deadline" ? "deadline"
    : rent.stoppedBy === "max_batches" || saas.stoppedBy === "max_batches" ? "max_batches" : "empty";
  return { rent: rent.summary, saas: saas.summary, stoppedBy };
}
