"use server";

// =============================================================================
// NCE-01 — Server Actions : réglages de communication (propriétaire seul)
// =============================================================================
// Double barrière : garde applicative (session, rôle propriétaire,
// Organization active, fail-closed) puis RPC qui revérifie tout en base et
// audite. Aucun error.message brut. Le test d'envoi n'existe pas en
// production et ne vise JAMAIS un destinataire réel : l'adresse de
// simulation Resend « delivered@resend.dev ».
// =============================================================================

import { getActiveAuthorization, isOrganizationActive } from "@/core/authorization/server";
import { createResendTransport } from "@/core/email/resend-transport";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMMUNICATIONS_ENV, isProductionDeployment, resolveTransactionalEmailStatus } from "@/modules/communications/config";
import {
  RESEND_SIMULATED_DELIVERED,
  anyToggleEnabled,
  parseToggleInput,
  testDeliveryIdempotencyKey,
  type CommunicationSettingsError,
} from "@/modules/communications/settings-model";

export type CommunicationSettingsResult = { ok: true } | { ok: false; error: CommunicationSettingsError };

async function ownerGuard(): Promise<{ organizationId: string } | { error: CommunicationSettingsError }> {
  const authorization = await getActiveAuthorization();
  if (!authorization) return { error: "unauthenticated" };
  if (authorization.role !== "organization_owner") return { error: "forbidden" };
  if (!(await isOrganizationActive(authorization.organizationId))) return { error: "organization_unavailable" };
  return { organizationId: authorization.organizationId };
}

export async function saveCommunicationSettingsAction(input: unknown): Promise<CommunicationSettingsResult> {
  const values = parseToggleInput(input);
  if (!values) return { ok: false, error: "invalid_settings" };
  const context = await ownerGuard();
  if ("error" in context) return { ok: false, error: context.error };
  // Aucun envoi ne peut être ACTIVÉ tant que l'environnement ne sait pas
  // envoyer : sinon la file grossirait sans jamais partir. Tout désactiver
  // reste toujours possible.
  if (anyToggleEnabled(values) && !resolveTransactionalEmailStatus(process.env).operational) {
    return { ok: false, error: "email_not_configured" };
  }
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("save_organization_communication_settings", {
    target_organization_id: context.organizationId,
    p_due_notice: values.dueNoticeEmailEnabled,
    p_overdue_reminder: values.overdueReminderEmailEnabled,
    p_payment_receipt: values.paymentReceiptEmailEnabled,
    p_rent_receipt: values.rentReceiptEmailEnabled,
    p_owner_copy: values.ownerCopyEnabled,
  });
  if (result.error) return { ok: false, error: result.error.code === "42501" ? "forbidden" : "failed" };
  const outcome = (result.data as { outcome?: unknown } | null)?.outcome;
  return outcome === "saved" ? { ok: true } : { ok: false, error: "invalid_settings" };
}

export async function sendCommunicationTestAction(): Promise<CommunicationSettingsResult> {
  if (isProductionDeployment(process.env)) return { ok: false, error: "production_disabled" };
  const context = await ownerGuard();
  if ("error" in context) return { ok: false, error: context.error };
  const status = resolveTransactionalEmailStatus(process.env);
  if (!status.operational) return { ok: false, error: "email_not_configured" };
  const transport = createResendTransport({ apiKey: process.env[COMMUNICATIONS_ENV.resendApiKey] ?? "" });
  const result = await transport.send({
    from: process.env[COMMUNICATIONS_ENV.from]?.trim() ?? "",
    to: RESEND_SIMULATED_DELIVERED,
    subject: "KJORA — test de configuration / configuration test",
    text: "Test de configuration KJORA (adresse de simulation, aucun destinataire réel).\nKJORA configuration test (simulated address, no real recipient).",
    html: "<p>Test de configuration KJORA (adresse de simulation, aucun destinataire réel).</p><p>KJORA configuration test (simulated address, no real recipient).</p>",
    tags: [{ name: "queue", value: "configuration_test" }],
  }, testDeliveryIdempotencyKey(context.organizationId, Date.now()));
  return result.ok ? { ok: true } : { ok: false, error: "failed" };
}
