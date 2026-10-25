import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicRequestOrigin } from "@/core/routing/public-origin";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const isPortal = request.nextUrl.searchParams.get("scope") === "portal";
  const response = NextResponse.redirect(
    new URL(isPortal ? "/portal/connexion" : "/connexion", getPublicRequestOrigin(request)),
    303,
  );
  response.cookies.delete(ACTIVE_ORGANIZATION_COOKIE);
  response.cookies.delete(ACTIVE_PORTAL_ACCESS_COOKIE);
  return response;
}
