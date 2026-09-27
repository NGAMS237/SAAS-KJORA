"use server";

// =============================================================================
// KJORA — REVENUE-LAUNCH-01 — Sous-lot 01H — Server Actions (cycle de vie Admin)
// =============================================================================
// Même schéma que commercial-ops-actions.ts (ADMIN-BILLING-OPS-01) : chaque
// action revérifie l'autorisation platform_admin CÔTÉ SERVEUR avant tout appel
// RPC (la RPC elle-même la revérifie une seconde fois — double barrière).
// error.message ne fuite jamais : seul le code Postgres distingue un refus
// (42501) d'un échec.
// =============================================================================

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LifecycleActionResult =
  | { ok: true; outcome: string; detail?: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed"; message: string };

function revalidateOrganization(organizationId: string) {
  revalidatePath("/administration/organizations");
  revalidatePath(`/administration/organizations/${organizationId}`);
}

async function callAdminLifecycleRpc(
  fn: string,
  params: Record<string, unknown>,
  organizationId: string,
): Promise<LifecycleActionResult> {
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

export async function suspendOrganizationAction(
  organizationId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_suspend_organization",
    { target_organization_id: organizationId, p_reason: reason },
    organizationId,
  );
}

export async function reactivateOrganizationAction(
  organizationId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_reactivate_organization",
    { target_organization_id: organizationId, p_reason: reason },
    organizationId,
  );
}

export async function archiveOrganizationAction(
  organizationId: string,
  confirmName: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_archive_organization",
    { target_organization_id: organizationId, p_confirm_name: confirmName, p_reason: reason },
    organizationId,
  );
}

export async function restoreOrganizationAction(
  organizationId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_restore_organization",
    { target_organization_id: organizationId, p_reason: reason },
    organizationId,
  );
}

export async function disableMemberAction(
  organizationId: string,
  membershipId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_disable_member",
    { target_organization_id: organizationId, target_membership_id: membershipId, p_reason: reason },
    organizationId,
  );
}

export async function reactivateMemberAction(
  organizationId: string,
  membershipId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_reactivate_member",
    { target_organization_id: organizationId, target_membership_id: membershipId, p_reason: reason },
    organizationId,
  );
}

export async function transferOwnershipAction(
  organizationId: string,
  membershipId: string,
  reason: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_transfer_organization_ownership",
    { target_organization_id: organizationId, target_membership_id: membershipId, p_reason: reason },
    organizationId,
  );
}

export async function addOrganizationNoteAction(
  organizationId: string,
  note: string,
): Promise<LifecycleActionResult> {
  return callAdminLifecycleRpc(
    "admin_add_organization_note",
    { target_organization_id: organizationId, p_note: note },
    organizationId,
  );
}
