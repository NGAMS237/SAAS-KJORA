"use server";

// =============================================================================
// KJORA — REVENUE-01B — Server Actions (facturation manuelle Afrique)
// =============================================================================
// Même double barrière que commercial-ops-actions.ts (ADMIN-BILLING-OPS-01) :
// vérification platform_admin côté serveur avant tout appel RPC, puis la RPC
// la revérifie elle-même. error.message n'est jamais renvoyé tel quel.
// =============================================================================

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ManualInvoicingActionResult =
  | { ok: true; outcome: string; detail?: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed"; message: string };

function revalidateOrganization(organizationId: string) {
  revalidatePath("/administration/organizations");
  revalidatePath(`/administration/organizations/${organizationId}`);
  revalidatePath("/administration/finances");
}

async function callAdminInvoicingRpc(
  fn: string,
  params: Record<string, unknown>,
  organizationId: string,
): Promise<ManualInvoicingActionResult> {
  const supabase = await createSupabaseServerClient();

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_platform_admin_self");
  if (adminCheckError || isAdmin !== true) {
    return { ok: false, reason: "denied", message: "Action réservée aux administrateurs plateforme." };
  }

  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const reason = error.code === "42501" ? "denied" : "failed";
    return {
      ok: false,
      reason,
      message:
        reason === "denied"
          ? "Action réservée aux administrateurs plateforme."
          : "L'opération a échoué. Réessayez plus tard.",
    };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const outcome = String(payload.outcome ?? "unknown");
  revalidateOrganization(organizationId);
  return { ok: true, outcome, detail: payload };
}

/** Émet une facture d'abonnement pour un règlement manuel (Afrique/XAF uniquement). */
export async function issueManualInvoiceAction(
  organizationId: string,
  plan: string,
  cycle: string,
  periodStart: string,
  periodEnd: string,
  idempotencyKey: string,
): Promise<ManualInvoicingActionResult> {
  return callAdminInvoicingRpc(
    "admin_issue_manual_invoice",
    {
      target_organization_id: organizationId,
      p_plan: plan,
      p_cycle: cycle,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_idempotency_key: idempotencyKey || randomUUID(),
    },
    organizationId,
  );
}

/** Confirme un règlement reçu hors ligne pour une facture déjà émise. */
export async function confirmManualInvoicePaymentAction(
  organizationId: string,
  invoiceId: string,
  currency: string,
  amountMinor: number,
  manualReference: string | null,
  note: string,
  idempotencyKey: string,
): Promise<ManualInvoicingActionResult> {
  return callAdminInvoicingRpc(
    "admin_confirm_manual_invoice_payment",
    {
      target_invoice_id: invoiceId,
      p_currency: currency,
      p_amount_minor: amountMinor,
      p_manual_reference: manualReference,
      p_note: note,
      p_idempotency_key: idempotencyKey || randomUUID(),
    },
    organizationId,
  );
}

/** Génère un jeton d'idempotence côté serveur pour un nouveau formulaire. */
export async function newManualInvoicingIdempotencyKeyAction(): Promise<string> {
  return randomUUID();
}
