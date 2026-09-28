"use server";

// =============================================================================
// NCE-01 — Server Actions Admin : supervision des communications
// =============================================================================
// Double barrière (is_platform_admin_self puis assert_platform_admin dans
// chaque RPC). DRY-RUN PAR DÉFAUT : un appel sans argument explicite ne crée
// aucune facture, aucun avis et n'envoie rien. Chaque action est journalisée
// en base (private.platform_operation_runs). Retour : compteurs seulement.
// =============================================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSaasAutoInvoicingEnabled } from "@/modules/communications/config";
import { createServiceRoleClient, drainQueuesIfConfigured, summarizeDrain } from "@/modules/communications/server";

export type OperationsActionResult =
  | { ok: true; detail: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed" };

async function assertAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_platform_admin_self");
  return error || data !== true ? null : supabase;
}

function stripSensitive(value: unknown): Record<string, unknown> {
  // Défense en profondeur : les RPC ne renvoient déjà que des compteurs.
  const json = JSON.stringify(value ?? {});
  return JSON.parse(json.replace(/"[^"]*@[^"]*"/g, "\"[masqué]\"")) as Record<string, unknown>;
}

export async function runCommunicationsAction(dryRun = true): Promise<OperationsActionResult> {
  const supabase = await assertAdmin();
  if (!supabase) return { ok: false, reason: "denied" };
  const effectiveDryRun = dryRun !== false;
  // La génération RÉELLE des factures SaaS obéit au même interrupteur que le
  // cron (KJORA_SAAS_AUTO_INVOICING_ENABLED) : désactivé, l'exécution réelle
  // se limite au vidage des files déjà constituées, factures en dry-run.
  const invoicingDryRun = effectiveDryRun || !isSaasAutoInvoicingEnabled(process.env);
  const result = await supabase.rpc("admin_run_communications", { p_dry_run: invoicingDryRun, p_will_drain: !effectiveDryRun });
  if (result.error) return { ok: false, reason: result.error.code === "42501" ? "denied" : "failed" };
  const detail: Record<string, unknown> = { ...((result.data ?? {}) as Record<string, unknown>), invoicingDryRun };
  if (effectiveDryRun) return { ok: true, detail: stripSensitive(detail) };

  // Exécution réelle : vidage des files par le même worker que le cron.
  const runId = typeof detail.runId === "string" ? detail.runId : null;
  const service = createServiceRoleClient();
  const delivery = service
    ? await drainQueuesIfConfigured(service, Date.now() + 45_000)
    : { status: "error" as const, reason: "service_unavailable" as const };
  const summary = summarizeDrain(delivery);
  if (runId) {
    await supabase.rpc("admin_finish_communications_run", {
      p_run_id: runId, p_summary: { delivery: summary }, p_succeeded: delivery.status !== "error",
    });
  }
  return { ok: true, detail: stripSensitive({ ...detail, delivery: summary }) };
}

export async function reconcileDueNoticesAction(dryRun = true, batchLimit = 50): Promise<OperationsActionResult> {
  const supabase = await assertAdmin();
  if (!supabase) return { ok: false, reason: "denied" };
  const limit = Number.isInteger(batchLimit) ? Math.min(Math.max(batchLimit, 1), 500) : 50;
  const result = await supabase.rpc("admin_reconcile_due_notices", { p_batch_limit: limit, p_dry_run: dryRun !== false });
  if (result.error) return { ok: false, reason: result.error.code === "42501" ? "denied" : "failed" };
  return { ok: true, detail: stripSensitive(result.data) };
}

export async function retryFailedDeliveriesAction(): Promise<OperationsActionResult> {
  const supabase = await assertAdmin();
  if (!supabase) return { ok: false, reason: "denied" };
  const result = await supabase.rpc("admin_retry_failed_deliveries");
  if (result.error) return { ok: false, reason: result.error.code === "42501" ? "denied" : "failed" };
  return { ok: true, detail: stripSensitive(result.data) };
}

export type DeliveryReviewDecision = "confirm_sent" | "resend" | "abandon";

/**
 * Décision Admin EXPLICITE sur une ligne à l'issue inconnue. « resend »
 * accepte en connaissance de cause un risque de doublon (nouvelle
 * génération, nouvelle Idempotency-Key). Motif obligatoire ; auditée en base.
 * Aucune expédition n'est déclenchée ici : la ligne repasse en file et part
 * au prochain passage quotidien ou déclenchement Admin.
 */
export async function resolveDeliveryReviewAction(
  queue: unknown,
  deliveryId: unknown,
  decision: unknown,
  note: unknown,
  providerMessageId: unknown = null,
): Promise<OperationsActionResult> {
  const supabase = await assertAdmin();
  if (!supabase) return { ok: false, reason: "denied" };
  if ((queue !== "rent" && queue !== "saas") || typeof deliveryId !== "string"
    || !/^[0-9a-f-]{36}$/i.test(deliveryId)
    || (decision !== "confirm_sent" && decision !== "resend" && decision !== "abandon")
    || typeof note !== "string") {
    return { ok: false, reason: "failed" };
  }
  const result = await supabase.rpc("admin_resolve_delivery_review", {
    p_queue: queue,
    p_delivery_id: deliveryId,
    p_decision: decision,
    p_note: note,
    p_provider_message_id: typeof providerMessageId === "string" && providerMessageId.trim() ? providerMessageId.trim() : null,
  });
  if (result.error) return { ok: false, reason: result.error.code === "42501" ? "denied" : "failed" };
  return { ok: true, detail: stripSensitive(result.data) };
}
