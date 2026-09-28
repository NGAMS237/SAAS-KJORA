"use server";

// =============================================================================
// KJORA — REVENUE-01C — Server Action (rappels de facturation)
// =============================================================================
// Même double barrière que commercial-ops-actions.ts / manual-invoicing-
// actions.ts. `dryRun` vaut `true` par défaut ici aussi côté serveur : un
// appel sans argument explicite ne journalise et n'envoie RIEN.
// =============================================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillingRemindersRunResult =
  | { ok: true; outcome: string; detail: Record<string, unknown> }
  | { ok: false; reason: "denied" | "failed"; message: string };

/**
 * Calcule les rappels de facturation dus. `dryRun = true` (défaut) ne
 * journalise et n'envoie rien : c'est un aperçu. Aucun email n'est jamais
 * envoyé par cette action, quel que soit `dryRun` — l'envoi réel reste hors
 * périmètre de REVENUE-01C.
 */
export async function runBillingRemindersAction(
  asOf: string | null = null,
  dryRun = true,
): Promise<BillingRemindersRunResult> {
  const supabase = await createSupabaseServerClient();

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_platform_admin_self");
  if (adminCheckError || isAdmin !== true) {
    return { ok: false, reason: "denied", message: "Action réservée aux administrateurs plateforme." };
  }

  const { data, error } = await supabase.rpc("admin_run_billing_reminders", {
    p_as_of: asOf,
    p_dry_run: dryRun,
  });
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
  return { ok: true, outcome: String(payload.outcome ?? "unknown"), detail: payload };
}
