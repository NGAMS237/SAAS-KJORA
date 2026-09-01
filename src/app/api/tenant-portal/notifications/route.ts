import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPortalContext } from "@/tenant-portal/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const context = await loadPortalContext();
  if (!context?.activeAccess) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown; notificationId?: unknown } | null;
  const supabase = await createSupabaseServerClient();

  if (body?.action === "mark_all_read") {
    const { error } = await supabase.rpc("mark_all_tenant_portal_notifications_read", {
      target_access_id: context.activeAccess.accessId,
    });
    return error ? NextResponse.json({ error: "not_found" }, { status: 404 }) : NextResponse.json({ ok: true });
  }
  if ((body?.action === "mark_read" || body?.action === "mark_unread") && typeof body.notificationId === "string") {
    const { error } = await supabase.rpc("set_tenant_portal_notification_read_state", {
      target_access_id: context.activeAccess.accessId,
      target_notification_id: body.notificationId,
      target_is_read: body.action === "mark_read",
    });
    return error ? NextResponse.json({ error: "not_found" }, { status: 404 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
}
