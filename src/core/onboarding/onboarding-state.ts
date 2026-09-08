// =============================================================================
// KJORA — État d'onboarding (ALIGN-02)
// =============================================================================
// Module pur : aucune dépendance serveur, entièrement testable.
// Miroir TypeScript de la table public.onboarding_states.
// =============================================================================

import { isPlanSlug, type PlanSlug } from "../entitlements/model.ts";

export const ONBOARDING_STEPS = [
  "plan_intent",
  "organization",
  "rent_method",
  "property",
  "unit",
  "completed",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Rang canonique d'une étape — miroir de private.onboarding_step_rank. */
export function onboardingStepRank(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export const RENT_COLLECTION_METHODS = [
  "mtn_momo",
  "orange_money",
  "merchant_account",
  "bank_transfer",
  "cash",
  "multiple",
] as const;

export type RentCollectionMethod = (typeof RENT_COLLECTION_METHODS)[number];

export function isRentCollectionMethod(value: unknown): value is RentCollectionMethod {
  return (
    typeof value === "string" &&
    (RENT_COLLECTION_METHODS as readonly string[]).includes(value)
  );
}

export const RENT_COLLECTION_LABELS: Record<RentCollectionMethod, string> = {
  mtn_momo: "MTN MoMo sur mon numéro personnel",
  orange_money: "Orange Money sur mon numéro personnel",
  merchant_account: "Compte marchand",
  bank_transfer: "Virement bancaire",
  cash: "Cash",
  multiple: "Plusieurs moyens",
};

export type OnboardingState = {
  exists: boolean;
  step: OnboardingStep;
  planIntent: PlanSlug | null;
  rentCollectionMethod: RentCollectionMethod | null;
  organizationId: string | null;
  firstPropertyId: string | null;
  firstUnitId: string | null;
  completedAt: string | null;
};

export function emptyOnboardingState(): OnboardingState {
  return {
    exists: false,
    step: "plan_intent",
    planIntent: null,
    rentCollectionMethod: null,
    organizationId: null,
    firstPropertyId: null,
    firstUnitId: null,
    completedAt: null,
  };
}

/** Parse la réponse jsonb du RPC get_onboarding_state. Tolérant : jamais d'exception. */
export function parseOnboardingState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== "object") return emptyOnboardingState();
  const r = raw as Record<string, unknown>;
  const step = isOnboardingStep(r.step) ? r.step : "plan_intent";
  const planIntent =
    typeof r.plan_intent === "string" && isPlanSlug(r.plan_intent) ? r.plan_intent : null;
  return {
    exists: r.exists === true,
    step,
    planIntent,
    rentCollectionMethod: isRentCollectionMethod(r.rent_collection_method)
      ? r.rent_collection_method
      : null,
    organizationId: typeof r.organization_id === "string" ? r.organization_id : null,
    firstPropertyId: typeof r.first_property_id === "string" ? r.first_property_id : null,
    firstUnitId: typeof r.first_unit_id === "string" ? r.first_unit_id : null,
    completedAt: typeof r.completed_at === "string" ? r.completed_at : null,
  };
}

/**
 * Destination de reprise pour un onboarding inachevé.
 * Pure : c'est la fonction qui rend l'onboarding « resumable ».
 */
export function nextOnboardingDestination(state: OnboardingState): string {
  switch (state.step) {
    case "plan_intent":
    case "organization":
      return "/onboarding/organization";
    case "rent_method":
      return "/onboarding/organization?reprise=rent_method";
    case "property":
      return "/onboarding/bien";
    case "unit":
      return "/onboarding/logement";
    case "completed":
      return "/app";
  }
}

/**
 * Une étape ne peut jamais reculer : miroir exact de la logique SQL.
 * Utilisé côté client pour ne pas réafficher une étape déjà franchie.
 */
export function advanceStep(current: OnboardingStep, candidate: OnboardingStep): OnboardingStep {
  return onboardingStepRank(candidate) > onboardingStepRank(current) ? candidate : current;
}

/** L'onboarding est-il terminé ? */
export function isOnboardingComplete(state: OnboardingState): boolean {
  return state.step === "completed";
}
