import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPlanSlug } from "@/core/entitlements/model";
import {
  BILLING_COUNTRIES,
  SITE_APP_LOCALES,
  SITE_APP_SOURCES,
} from "@/core/onboarding/plan-intent";
import { isBillingCycle } from "@/core/billing/model";
import {
  isOnboardingStep,
  isRentCollectionMethod,
  parseOnboardingState,
} from "@/core/onboarding/onboarding-state";

// =============================================================================
// ALIGN-02 — API d'état d'onboarding
// =============================================================================
// GET  : lit l'état courant (reprise après interruption)
// POST : enregistre la progression de façon idempotente
//
// Toute écriture passe par le RPC SECURITY DEFINER upsert_onboarding_state :
//   • une ressource déjà enregistrée n'est jamais écrasée (anti-double-submit) ;
//   • l'étape n'avance jamais à reculons ;
//   • un plan_intent invalide est ignoré sans erreur et n'accorde aucun droit.
// =============================================================================

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_onboarding_state");
  if (error) {
    return NextResponse.json({ error: "onboarding_state_unavailable" }, { status: 500 });
  }
  return NextResponse.json({ state: parseOnboardingState(data) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  // A valid plan+cycle replaces the previous intent atomically. Country may be
  // null only while the explicit in-app choice is pending; invalid countries
  // are rejected and never erase a resumable intent.
  if (body.intent_mode === "replace") {
    const validPlan = typeof body.plan_intent === "string" && isPlanSlug(body.plan_intent);
    const validCycle = isBillingCycle(body.billing_cycle_intent);
    const validCountry = body.billing_country_intent == null || (
      typeof body.billing_country_intent === "string"
      && (BILLING_COUNTRIES as readonly string[]).includes(body.billing_country_intent)
    );
    const validLocale = typeof body.locale_intent === "string"
      && (SITE_APP_LOCALES as readonly string[]).includes(body.locale_intent);
    const validSource = body.source_intent == null || (
      typeof body.source_intent === "string"
      && (SITE_APP_SOURCES as readonly string[]).includes(body.source_intent)
    );
    if (!validPlan || !validCycle || !validCountry || !validLocale || !validSource) {
      return NextResponse.json({ error: "invalid_site_app_intent" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("replace_site_app_intent", {
      target_plan: body.plan_intent,
      target_cycle: body.billing_cycle_intent,
      target_billing_country: body.billing_country_intent,
      target_locale: body.locale_intent,
      target_source: body.source_intent ?? null,
    });
    if (error) return NextResponse.json({ error: "onboarding_update_failed" }, { status: 400 });
    return NextResponse.json({ state: parseOnboardingState(data) });
  }

  // Normalisation défensive : toute valeur non reconnue devient null et est
  // ignorée par le RPC. Aucun paramètre client n'est propagé tel quel.
  const planIntent =
    typeof body.plan_intent === "string" && isPlanSlug(body.plan_intent) ? body.plan_intent : null;
  const rentMethod = isRentCollectionMethod(body.rent_collection_method)
    ? body.rent_collection_method
    : null;
  const step = isOnboardingStep(body.step) ? body.step : null;
  const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
  const firstPropertyId = typeof body.first_property_id === "string" ? body.first_property_id : null;
  const firstUnitId = typeof body.first_unit_id === "string" ? body.first_unit_id : null;

  const { data, error } = await supabase.rpc("upsert_onboarding_state", {
    p_plan_intent: planIntent,
    p_rent_collection_method: rentMethod,
    p_organization_id: organizationId,
    p_first_property_id: firstPropertyId,
    p_first_unit_id: firstUnitId,
    p_step: step,
  });

  if (error) {
    if (error.message?.includes("organization_not_owned")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "onboarding_update_failed" }, { status: 400 });
  }

  return NextResponse.json({ state: parseOnboardingState(data) });
}
