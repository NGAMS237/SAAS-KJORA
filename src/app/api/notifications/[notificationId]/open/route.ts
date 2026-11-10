import { NextResponse, type NextRequest } from "next/server";
import { getPublicRequestOrigin } from "@/core/routing/public-origin";
import { getActiveAuthorization, isOrganizationActive } from "@/core/authorization/server";
import { ROUTE_CONNEXION, ROUTE_SUSPENDED } from "@/core/routing/context-resolver";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  NOTIFICATION_CENTER,
  isUuid,
  notificationOpenMode,
  notificationFallbackHref,
  resolveNotificationDestination,
  type NotificationOpenResult,
} from "@/modules/notifications/model";

// =============================================================================
// NCE-01 — Ouvrir une notification = la marquer lue + rejoindre une
// destination FERMÉE, re-vérifiée en base (public.open_notification).
// Jamais d'URL issue du payload, jamais de 404 générique : tout échec retombe
// sur le centre de notifications avec un message non bloquant.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, getPublicRequestOrigin(request)), 303);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ notificationId: string }> }) {
  const { notificationId } = await params;

  // Lien venu d'un autre site : ni lecture, ni écriture — retour au centre.
  // En-tête absent : fail-closed pour l'écriture (lecture seule, peek).
  const mode = notificationOpenMode(request.headers.get("sec-fetch-site"));
  if (mode === "reject") {
    return redirectTo(request, `${NOTIFICATION_CENTER}#notifications`);
  }

  const authorization = await getActiveAuthorization();
  if (!authorization) return redirectTo(request, ROUTE_CONNEXION);
  if (!(await isOrganizationActive(authorization.organizationId))) return redirectTo(request, ROUTE_SUSPENDED);
  if (!isUuid(notificationId)) return redirectTo(request, notificationFallbackHref("notification_unavailable"));

  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);
  const result = await supabase.rpc(mode === "open" ? "open_notification" : "peek_notification", {
    target_notification_id: notificationId,
  });
  if (result.error) {
    return applyAuthState(redirectTo(request, notificationFallbackHref("notification_unavailable")));
  }
  const destination = resolveNotificationDestination(
    (result.data ?? null) as NotificationOpenResult | null,
    authorization.organizationId,
  );
  return applyAuthState(redirectTo(request, destination.href));
}
