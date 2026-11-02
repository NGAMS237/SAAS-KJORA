import { isSameOrigin } from "@/core/security/same-origin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";
import { TENANT_PORTAL_INVITATION_COOKIE } from "@/tenant-portal/invitation-cookie";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = (await cookies()).get(TENANT_PORTAL_INVITATION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "invalid_invitation" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_tenant_portal_invitation", { invitation_token: token });
  if (error || typeof data !== "string") return NextResponse.json({ error: "invitation_rejected" }, { status: 400 });
  const response = NextResponse.json({ accessId: data });
  response.cookies.delete(TENANT_PORTAL_INVITATION_COOKIE);
  response.cookies.set(ACTIVE_PORTAL_ACCESS_COOKIE, data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
  return response;
}
