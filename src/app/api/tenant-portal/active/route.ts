import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { accessId?: unknown } | null;
  if (typeof body?.accessId !== "string") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_tenant_portal_accesses");
  if (error || !(data ?? []).some((row: { access_id?: string }) => row.access_id === body.accessId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const response = NextResponse.json({ activeAccessId: body.accessId });
  response.cookies.set(ACTIVE_PORTAL_ACCESS_COOKIE, body.accessId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
  return response;
}
