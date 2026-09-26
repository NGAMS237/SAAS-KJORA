"use server";

// =============================================================================
// KJORA — ADMIN-02 — Actions serveur sur un abonnement
// =============================================================================
// Chaque action revérifie l'autorisation plateforme AVANT d'appeler la RPC,
// en plus de la vérification faite par la RPC elle-même (private.
// assert_platform_admin) : deux couches indépendantes, jamais une confiance
// au frontend. Aucune action n'est joignable via GET — toutes passent par un
// Server Action Next.js, jamais par un paramètre d'URL.
//
// Chaque fonction renvoie un résultat sérialisable typé, jamais une erreur
// SQL brute : le message affiché à l'écran vient d'ici, pas de Postgres.
// =============================================================================

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePlatformAdmin } from "@/core/authorization/platform-admin";

export type SubscriptionActionResult =
  | { ok: true; outcome: string; detail?: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed"; message: string };

const CANONICAL_PLANS = ["decouverte", "essentiel", "avance", "patrimoine", "sur_mesure"] as const;
const CANONICAL_CYCLES = ["monthly", "annual"] as const;

function revalidateSubscription(organizationId: string) {
  revalidatePath("/administration/abonnements");
  revalidatePath(`/administration/abonnements/${organizationId}`);
}

async function callAdminSubscriptionRpc(
  fn: string,
  params: Record<string, unknown>,
  organizationId: string,
): Promise<SubscriptionActionResult> {
  const decision = await resolvePlatformAdmin();
  if (!decision.allowed) {
    return { ok: false, reason: "denied", message: "Action réservée aux administrateurs plateforme." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, params);

  if (error) {
    const reason = error.code === "42501" ? "denied" : "failed";
    return {
      ok: false,
      reason,
      message:
        reason === "denied"
          ? "Action réservée aux administrateurs plateforme."
          : "L'action n'a pas pu être effectuée. Réessayez plus tard.",
    };
  }

  const payload = (data as Record<string, unknown>) ?? {};
  const outcome = typeof payload.outcome === "string" ? payload.outcome : "unknown";

  revalidateSubscription(organizationId);

  return { ok: true, outcome, detail: payload };
}

export async function changeSubscriptionPlanAction(
  organizationId: string,
  plan: string,
  cycle: string,
  reason: string,
): Promise<SubscriptionActionResult> {
  if (!CANONICAL_PLANS.includes(plan as (typeof CANONICAL_PLANS)[number])) {
    return { ok: false, reason: "failed", message: "Forfait invalide." };
  }
  if (!CANONICAL_CYCLES.includes(cycle as (typeof CANONICAL_CYCLES)[number])) {
    return { ok: false, reason: "failed", message: "Cycle de facturation invalide." };
  }
  return callAdminSubscriptionRpc(
    "admin_change_subscription_plan",
    {
      target_organization_id: organizationId,
      target_plan: plan,
      target_cycle: cycle,
      reason: reason.trim() || null,
    },
    organizationId,
  );
}

export async function suspendSubscriptionAction(
  organizationId: string,
  reason: string,
): Promise<SubscriptionActionResult> {
  return callAdminSubscriptionRpc(
    "admin_suspend_subscription",
    { target_organization_id: organizationId, reason: reason.trim() || null },
    organizationId,
  );
}

export async function reactivateSubscriptionAction(
  organizationId: string,
  reason: string,
): Promise<SubscriptionActionResult> {
  return callAdminSubscriptionRpc(
    "admin_reactivate_subscription",
    { target_organization_id: organizationId, reason: reason.trim() || null },
    organizationId,
  );
}

export async function scheduleSubscriptionCancellationAction(
  organizationId: string,
  reason: string,
): Promise<SubscriptionActionResult> {
  return callAdminSubscriptionRpc(
    "admin_schedule_subscription_cancellation",
    { target_organization_id: organizationId, reason: reason.trim() || null },
    organizationId,
  );
}

export async function revokeSubscriptionCancellationAction(
  organizationId: string,
  reason: string,
): Promise<SubscriptionActionResult> {
  return callAdminSubscriptionRpc(
    "admin_revoke_subscription_cancellation",
    { target_organization_id: organizationId, reason: reason.trim() || null },
    organizationId,
  );
}

export async function archiveSubscriptionAction(
  organizationId: string,
  reason: string,
): Promise<SubscriptionActionResult> {
  return callAdminSubscriptionRpc(
    "admin_archive_subscription",
    { target_organization_id: organizationId, reason: reason.trim() || null },
    organizationId,
  );
}
