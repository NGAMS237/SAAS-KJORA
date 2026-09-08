// =============================================================================
// KJORA — Plan intent utilities (ALIGN-02)
// =============================================================================
// plan_requested is a URL / form parameter coming from the marketing site.
// It is NEVER used to assign a paid plan — Découverte is always assigned
// automatically by the database trigger (ALIGN-01). plan_requested only
// influences UX messaging and intent preservation.
//
// Security principle: plan_requested is untrusted input. The server validates
// it to a known PlanSlug and ignores anything invalid. No routing logic, no
// entitlement decision, no plan assignment is based on this value alone.
// =============================================================================

import { isPlanSlug, type PlanSlug, PLAN_LABELS } from "../entitlements/model.ts";

/** Validate and extract a plan slug from a raw URL/form parameter. Invalid → null. */
export function parsePlanRequested(
  value: string | string[] | null | undefined,
): PlanSlug | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return isPlanSlug(trimmed) ? trimmed : null;
}

/**
 * Sur mesure requires a commercial discussion — it is never a self-serve flow.
 * When plan_requested=sur_mesure, onboarding redirects to the commercial contact form.
 */
export function isSurMesure(plan: PlanSlug | null): boolean {
  return plan === "sur_mesure";
}

/**
 * Plans that need intent preservation: the user wanted a paid plan but gets
 * Découverte initially. We preserve the intent so the upgrade path is clear.
 */
export function needsIntentPreservation(plan: PlanSlug | null): boolean {
  return plan === "essentiel" || plan === "avance" || plan === "patrimoine";
}

/** Human-readable label for a plan slug in French. */
export function planLabel(plan: PlanSlug | null, lang: "fr" | "en" = "fr"): string {
  if (!plan) return "";
  return PLAN_LABELS[plan]?.[lang] ?? plan;
}

/**
 * Build the /connexion URL that preserves plan_requested through the auth
 * callback and into the onboarding page.
 *
 * The `next` parameter encodes the onboarding destination so the auth callback
 * can redirect there after PKCE exchange. safeNextPath on the server validates
 * the path.
 */
export function buildConnexionUrl(planRequested: PlanSlug | null): string {
  const base = "/connexion";
  if (!planRequested) return base;
  const next = encodeURIComponent(`/onboarding/organization?plan_requested=${planRequested}`);
  return `${base}?plan_requested=${planRequested}&next=${next}`;
}

/** Commercial contact URL for sur_mesure prospects. */
export const SUR_MESURE_CONTACT_URL = "https://kjora.com/contact-sur-mesure";
