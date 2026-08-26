import { NextResponse, type NextRequest } from "next/server";
import {
  classifyAuthCallbackFailure,
  createSafeAuthCallbackDiagnostic,
  hasPkceVerifierCookie,
} from "@/core/auth/callback-diagnostics";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");

  if (!code) {
    return NextResponse.redirect(
      new URL("/connexion?reason=invalid-or-expired-link", request.url),
    );
  }

  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (!error) {
    return applyAuthState(NextResponse.redirect(new URL("/app", request.url)));
  }

  const cookieNames = request.cookies.getAll().map(({ name }) => name);
  console.error(
    "[Kjora Auth] PKCE callback exchange failed",
    createSafeAuthCallbackDiagnostic(error, {
      hasAuthorizationCode: true,
      hasFlowId: Boolean(flowId),
      hasPkceVerifier: hasPkceVerifierCookie(cookieNames),
      host: request.nextUrl.host,
    }),
  );

  const reason = classifyAuthCallbackFailure(error);
  return applyAuthState(
    NextResponse.redirect(new URL(`/connexion?reason=${reason}`, request.url)),
  );
}
