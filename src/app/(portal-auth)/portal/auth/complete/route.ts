import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_tenant_portal_session");
  if (error || Number(data) < 1) return NextResponse.redirect(new URL("/portal/connexion?reason=portal-access-required", request.url));
  const accesses = await supabase.rpc("list_my_tenant_portal_accesses");
  const first = accesses.data?.[0] as { access_id?: string } | undefined;
  const response = NextResponse.redirect(new URL("/portal", request.url));
  if (first?.access_id) response.cookies.set(ACTIVE_PORTAL_ACCESS_COOKIE, first.access_id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
  return response;
}
