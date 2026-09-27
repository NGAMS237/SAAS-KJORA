"use server";

// =============================================================================
// KJORA — REVENUE-LAUNCH-01 — Sous-lot 01I — Server Actions (contacts commerciaux)
// =============================================================================
// Même schéma que commercial-ops-actions.ts / organization-lifecycle-actions.ts :
// double barrière (revérification serveur + RPC), error.message jamais exposé.
// Aucune de ces actions n'envoie quoi que ce soit : uniquement de la capture
// et de la consultation de consentement — voir la migration REVENUE-01I.
// =============================================================================

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContactActionResult =
  | { ok: true; outcome: string; detail?: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed"; message: string };

async function callAdminContactRpc(
  fn: string,
  params: Record<string, unknown>,
): Promise<ContactActionResult> {
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
  revalidatePath("/administration/contacts");
  return { ok: true, outcome, detail: payload };
}

export async function upsertOrganizationContactAction(
  organizationId: string,
  phone: string,
  country: string,
  language: string,
): Promise<ContactActionResult> {
  return callAdminContactRpc("admin_upsert_organization_contact", {
    target_organization_id: organizationId,
    p_phone: phone || null,
    p_country: country,
    p_language: language,
  });
}

export async function setMarketingConsentAction(
  organizationId: string,
  consent: boolean,
  source: string,
): Promise<ContactActionResult> {
  return callAdminContactRpc("admin_set_marketing_consent", {
    target_organization_id: organizationId,
    p_consent: consent,
    p_source: source,
  });
}
