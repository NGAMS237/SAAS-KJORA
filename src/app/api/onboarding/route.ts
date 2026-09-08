import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPlanSlug } from "@/core/entitlements/model";
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
