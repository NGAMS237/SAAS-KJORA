"use server";

// =============================================================================
// KJORA — NOTIFICATIONS-COMMUNICATIONS-E2E-01 — Server Actions lu/non lu
// =============================================================================
// Double barrière : garde applicative (session, Organization active,
// fail-closed) puis RPC SECURITY DEFINER qui revérifie destinataire,
// capacité et Organization. Idempotent : marquer lue une notification déjà
// lue ne change rien. Jamais un error.message brut renvoyé au navigateur :
// uniquement un code stable, traduit côté client.
// =============================================================================

import { getActiveAuthorization, isOrganizationActive } from "@/core/authorization/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid, mapNotificationRpcError, type NotificationActionError } from "@/modules/notifications/model";

export type NotificationActionResult =
  | { ok: true; updated: number }
  | { ok: false; error: NotificationActionError };

async function guard(): Promise<{ organizationId: string } | { error: NotificationActionError }> {
  const authorization = await getActiveAuthorization();
  if (!authorization) return { error: "unauthenticated" };
  if (!(await isOrganizationActive(authorization.organizationId))) return { error: "organization_unavailable" };
  return { organizationId: authorization.organizationId };
}

export async function setNotificationReadAction(notificationId: unknown, isRead: unknown): Promise<NotificationActionResult> {
  if (!isUuid(notificationId) || typeof isRead !== "boolean") return { ok: false, error: "invalid_notification" };
  const context = await guard();
  if ("error" in context) return { ok: false, error: context.error };
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("set_notification_read_state", {
    target_notification_id: notificationId,
    target_is_read: isRead,
  });
  if (result.error) return { ok: false, error: mapNotificationRpcError(result.error) };
  return { ok: true, updated: result.data ? 1 : 0 };
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  const context = await guard();
  if ("error" in context) return { ok: false, error: context.error };
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("mark_all_notifications_read", {
    target_organization_id: context.organizationId,
  });
  if (result.error) return { ok: false, error: mapNotificationRpcError(result.error) };
  return { ok: true, updated: Number(result.data ?? 0) };
}
