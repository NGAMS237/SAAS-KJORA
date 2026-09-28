import { NextResponse } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupportedOrganizationTimezone } from "@/core/organization/settings";
import { parseEntitlementError, entitlementErrorResponse } from "@/core/entitlements/server";
import { isPlanSlug } from "@/core/entitlements/model";
import { isSupportedCountry, isRentalCurrency } from "@/core/currency/metadata";

function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: unknown;
    language?: unknown;
    timezone?: unknown;
    country?: unknown; // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A : optionnel, défaut CM côté RPC
    currency?: unknown; // idem — défaut XAF côté RPC
    plan_intent?: unknown; // ALIGN-02: passed for analytics/logging — NEVER used for plan assignment
  };

  if (
    typeof body.name !== "string" ||
    typeof body.language !== "string" ||
    !isSupportedOrganizationTimezone(body.timezone)
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A : pays/devise sont optionnels ici
  // (rétrocompatible avec tout appelant existant qui n'en envoie pas — la RPC
  // applique alors ses défauts CM/XAF) mais, s'ils sont fournis, ils doivent
  // appartenir aux catalogues supportés ; sinon on refuse tôt plutôt que de
  // laisser la RPC lever une erreur générique moins actionnable pour l'UI.
  if (body.country !== undefined && (typeof body.country !== "string" || !isSupportedCountry(body.country))) {
    return NextResponse.json({ error: "invalid_organization_country" }, { status: 400 });
  }
  if (body.currency !== undefined && (typeof body.currency !== "string" || !isRentalCurrency(body.currency))) {
    return NextResponse.json({ error: "invalid_organization_currency" }, { status: 400 });
  }

  // plan_intent is non-trustworthy — validate to a known slug for logging only.
  // It does NOT influence plan assignment (Découverte is always assigned by the DB trigger).
  const planIntent =
    typeof body.plan_intent === "string" && isPlanSlug(body.plan_intent)
      ? body.plan_intent
      : null;

  // Log plan_intent for analytics (server-side, no PII)
  if (planIntent && planIntent !== "decouverte") {
    console.info("[kjora:onboarding] plan_intent", planIntent);
  }

  const { data, error } = await supabase.rpc("create_organization", {
    organization_name: body.name,
    organization_language: body.language,
    organization_timezone: body.timezone,
    ...(typeof body.country === "string" ? { organization_country: body.country } : {}),
    ...(typeof body.currency === "string" ? { organization_currency: body.currency } : {}),
  });

  if (error) {
    // ALIGN-02: surface quota errors as structured 403 responses
    const entitlementErr = parseEntitlementError(error.message, error.details ?? undefined);
    if (entitlementErr) {
      return entitlementErrorResponse(entitlementErr);
    }
    console.error("[kjora:api/organizations] create_organization error", error.message);
    return NextResponse.json({ error: "organization_creation_failed" }, { status: 400 });
  }

  if (typeof data !== "string") {
    return NextResponse.json({ error: "organization_creation_failed" }, { status: 400 });
  }

  const response = NextResponse.json(
    { organizationId: data, planIntent },
    { status: 201 },
  );
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, data, cookieOptions());
  return response;
}
