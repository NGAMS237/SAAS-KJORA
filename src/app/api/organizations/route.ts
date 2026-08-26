import { NextResponse } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json()) as { name?: unknown; language?: unknown; timezone?: unknown };
  if (
    typeof body.name !== "string" ||
    typeof body.language !== "string" ||
    typeof body.timezone !== "string"
  ) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { data, error } = await supabase.rpc("create_organization", {
    organization_name: body.name,
    organization_language: body.language,
    organization_timezone: body.timezone,
  });
  if (error || typeof data !== "string") return NextResponse.json({ error: "organization_creation_failed" }, { status: 400 });

  const response = NextResponse.json({ organizationId: data }, { status: 201 });
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, data, cookieOptions());
  return response;
}
