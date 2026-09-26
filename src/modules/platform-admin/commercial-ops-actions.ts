"use server";

// =============================================================================
// KJORA — ADMIN-BILLING-OPS-01 — Server Actions (interventions commerciales)
// =============================================================================
// Chaque action revérifie l'autorisation platform_admin CÔTÉ SERVEUR avant
// tout appel RPC (la RPC elle-même la revérifie une seconde fois — double
// barrière, comme ADMIN-01/ADMIN-01.1). Aucune valeur calculée côté client
// n'est jamais transmise telle quelle : la RPC revalide tout.
//
// Le résultat ne laisse jamais fuiter error.message (peut contenir un détail
// SQL) : seul le code Postgres distingue un refus (42501) d'un échec.
// =============================================================================

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CommercialActionResult =
  | { ok: true; outcome: string; detail?: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed"; message: string };

function revalidateOrganization(organizationId: string) {
  revalidatePath("/administration/organizations");
  revalidatePath(`/administration/organizations/${organizationId}`);
}

async function callAdminCommercialRpc(
  fn: string,
  params: Record<string, unknown>,
  organizationId: string,
): Promise<CommercialActionResult> {
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

export async function grantCommercialInterventionAction(
  organizationId: string,
  interventionType: string,
  grantedPlan: string,
  reasonCode: string,
  adminNote: string,
  startsOn: string,
  endsOn: string | null,
  currency: string | null,
  amountMinor: number | null,
  manualReference: string | null,
  idempotencyKey: string,
): Promise<CommercialActionResult> {
  return callAdminCommercialRpc(
    "admin_grant_commercial_intervention",
    {
      target_organization_id: organizationId,
      p_intervention_type: interventionType,
      p_granted_plan: grantedPlan,
      p_reason_code: reasonCode,
      p_admin_note: adminNote,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_currency: currency,
      p_amount_minor: amountMinor,
      p_manual_reference: manualReference,
      p_idempotency_key: idempotencyKey || randomUUID(),
    },
    organizationId,
  );
}

export async function revokeCommercialInterventionAction(
  organizationId: string,
  interventionId: string,
  reason: string,
): Promise<CommercialActionResult> {
  return callAdminCommercialRpc(
    "admin_revoke_commercial_intervention",
    {
      target_organization_id: organizationId,
      target_intervention_id: interventionId,
      p_reason: reason,
    },
    organizationId,
  );
}

export async function extendCommercialInterventionAction(
  organizationId: string,
  interventionId: string,
  newEndsOn: string,
  reason: string,
): Promise<CommercialActionResult> {
  return callAdminCommercialRpc(
    "admin_extend_commercial_intervention",
    {
      target_organization_id: organizationId,
      target_intervention_id: interventionId,
      new_ends_on: newEndsOn,
      p_reason: reason,
    },
    organizationId,
  );
}

/** Génère un jeton d'idempotence côté serveur pour un nouveau formulaire d'octroi. */
export async function newIdempotencyKeyAction(): Promise<string> {
  return randomUUID();
}
