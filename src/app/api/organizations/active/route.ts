import { NextResponse } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json()) as { organizationId?: unknown };
  if (typeof body.organizationId !== "string" || !UUID.test(body.organizationId)) {
    return NextResponse.json({ error: "invalid_organization" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("organization_id", body.organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const response = NextResponse.json({ activeOrganizationId: body.organizationId });
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, body.organizationId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
  });
  return response;
}
