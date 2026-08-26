import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

type PendingCookie = {
  name: string;
  options: CookieOptions;
  value: string;
};

/**
 * Route Handlers must attach Supabase cookie writes to the response they
 * actually return. Keeping them pending also preserves the cache headers
 * supplied by @supabase/ssr when a session is created or refreshed.
 */
export function createSupabaseRouteHandlerClient(request: NextRequest) {
  const { publishableKey, url } = requireSupabasePublicConfig();
  const pendingCookies = new Map<string, PendingCookie>();
  const pendingHeaders = new Map<string, string>();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach((cookie) => pendingCookies.set(cookie.name, cookie));
        Object.entries(headers).forEach(([name, value]) => pendingHeaders.set(name, value));
      },
    },
  });

  function applyAuthState(response: NextResponse) {
    pendingCookies.forEach(({ name, options, value }) => {
      response.cookies.set(name, value, options);
    });
    pendingHeaders.forEach((value, name) => response.headers.set(name, value));
    return response;
  }

  return { applyAuthState, supabase };
}
