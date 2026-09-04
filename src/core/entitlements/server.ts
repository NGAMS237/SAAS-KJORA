import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isPlanSlug,
  isPlanFeature,
  minimumPlanForFeature,
  type OrganizationEntitlements,
  type PlanFeature,
  type EntitlementError,
} from "@/core/entitlements/model";

// =============================================================================
// getOrganizationEntitlements
// Fetches the plan, quotas, usage, and features for an organization.
// Caller must already be verified as an active member (via getActiveAuthorization).
// =============================================================================

export async function getOrganizationEntitlements(
  organizationId: string,
): Promise<OrganizationEntitlements | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_organization_entitlements", {
    p_organization_id: organizationId,
  });

  if (error || !data) return null;

  const raw = data as {
    plan: string;
    quotas: {
      max_properties: number | null;
      max_active_units: number | null;
      max_collaborators: number | null;
      max_organizations: number | null;
    };
    usage: {
      active_properties: number;
      active_units: number;
      collaborators: number;
    };
    features: string[];
  };

  if (!isPlanSlug(raw.plan)) return null;

  const features = new Set(
    (raw.features ?? []).filter(isPlanFeature),
  );

  return {
    organizationId,
    plan: raw.plan,
    quotas: {
      maxProperties: raw.quotas.max_properties,
      maxActiveUnits: raw.quotas.max_active_units,
      maxCollaborators: raw.quotas.max_collaborators,
      maxOrganizations: raw.quotas.max_organizations,
    },
    usage: {
      activeProperties: raw.usage.active_properties,
      activeUnits: raw.usage.active_units,
      collaborators: raw.usage.collaborators,
    },
    features,
  };
}

// =============================================================================
// requirePlanFeature
// Checks that the organization's plan includes the requested feature.
// Returns structured EntitlementError or null if allowed.
// Combines with RBAC: caller must separately verify the RBAC capability.
// Rule: RBAC authorized AND plan feature available → operation allowed.
// =============================================================================

export async function requirePlanFeature(
  organizationId: string,
  feature: PlanFeature,
): Promise<EntitlementError | null> {
  const entitlements = await getOrganizationEntitlements(organizationId);

  if (!entitlements) {
    // Cannot determine entitlements → deny safely
    return {
      code: "PLAN_FEATURE_NOT_AVAILABLE",
      plan: "decouverte",
      quota: null,
      current: 0,
    };
  }

  if (entitlements.features.has(feature)) return null;

  return {
    code: "PLAN_FEATURE_NOT_AVAILABLE",
    plan: entitlements.plan,
    quota: null,
    current: 0,
    suggestedUpgrade: minimumPlanForFeature(feature),
  };
}

// =============================================================================
// parseEntitlementError
// Parses Supabase/PostgreSQL exception detail into a structured EntitlementError.
// Use in API routes to convert quota raise exceptions into JSON responses.
// =============================================================================

const QUOTA_CODES = [
  "PLAN_PROPERTY_LIMIT_REACHED",
  "PLAN_ACTIVE_UNIT_LIMIT_REACHED",
  "PLAN_COLLABORATOR_LIMIT_REACHED",
  "PLAN_ORGANIZATION_LIMIT_REACHED",
  "PLAN_FEATURE_NOT_AVAILABLE",
] as const;

export function parseEntitlementError(
  message: string,
  detail?: string,
): EntitlementError | null {
  const code = QUOTA_CODES.find((c) => message.includes(c));
  if (!code) return null;

  try {
    const parsed = detail ? (JSON.parse(detail) as Record<string, unknown>) : {};
    const plan = isPlanSlug(String(parsed.plan)) ? String(parsed.plan) : "decouverte";
    return {
      code,
      plan: plan as OrganizationEntitlements["plan"],
      quota: typeof parsed.quota === "number" ? parsed.quota : null,
      current: typeof parsed.current === "number" ? parsed.current : 0,
    };
  } catch {
    return { code, plan: "decouverte", quota: null, current: 0 };
  }
}

// =============================================================================
// entitlementErrorResponse
// Convenience: returns a Response object (use in Next.js API routes).
// =============================================================================

export function entitlementErrorResponse(err: EntitlementError): Response {
  return Response.json(
    {
      error: err.code,
      plan: err.plan,
      quota: err.quota,
      current: err.current,
      suggestedUpgrade: err.suggestedUpgrade ?? null,
    },
    { status: 403 },
  );
}
