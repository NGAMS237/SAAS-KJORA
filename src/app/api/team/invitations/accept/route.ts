import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import { MEMBERSHIP_INVITATION_COOKIE } from "@/core/team/invitation-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cookieStore = await cookies();
  const token = cookieStore.get(MEMBERSHIP_INVITATION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "invalid_invitation" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("accept_membership_invitation", { invitation_token: token });
  if (error || typeof data !== "string") return NextResponse.json({ error: "invitation_rejected" }, { status: 400 });
  const response = NextResponse.json({ organizationId: data });
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, data, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
  });
  response.cookies.set(MEMBERSHIP_INVITATION_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0,
  });
  return response;
}
