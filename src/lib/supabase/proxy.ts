import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

function isProtectedPage(pathname: string) {
  return pathname === "/app"
    || pathname.startsWith("/app/")
    || pathname.startsWith("/onboarding/organization")
    || pathname === "/verrouillage"
    || pathname.startsWith("/verrouillage/");
}

function isProtectedPortalPage(pathname: string) {
  return pathname === "/portal" || pathname.startsWith("/portal/loyers")
    || pathname.startsWith("/portal/recus") || pathname.startsWith("/portal/compte")
    || pathname.startsWith("/portal/notifications") || pathname.startsWith("/portal/verrouillage")
    || pathname.startsWith("/portal/auth/complete");
}

function loginRedirect(request: NextRequest, reason?: string, cookiesFrom?: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  if (reason) url.searchParams.set("reason", reason);
  const redirect = NextResponse.redirect(url);
  cookiesFrom?.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function updateSession(request: NextRequest) {
  const config = getSupabasePublicConfig();

  if (!config) {
    if (isProtectedPortalPage(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/connexion";
      url.search = "";
      url.searchParams.set("reason", "supabase-not-configured");
      return NextResponse.redirect(url);
    }
    return isProtectedPage(request.nextUrl.pathname)
      ? loginRedirect(request, "supabase-not-configured") : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, options, value }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (!authenticated && isProtectedPage(pathname)) {
    return loginRedirect(request, undefined, response);
  }

  if (!authenticated && isProtectedPortalPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/connexion";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
