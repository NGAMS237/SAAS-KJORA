import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/app/:path*", "/connexion", "/onboarding/organization/:path*", "/verrouillage/:path*", "/invitation/:path*", "/portal/:path*"],
};
