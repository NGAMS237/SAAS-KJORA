// =============================================================================
// KJORA — Entitlements model (ALIGN-01)
// Source of truth for plan slugs, quota types, and feature identifiers.
// No billing, no provider, no subscription lifecycle.
// =============================================================================

export const PLAN_SLUGS = [
  "decouverte",
  "essentiel",
  "avance",
  "patrimoine",
  "sur_mesure",
] as const;

export type PlanSlug = (typeof PLAN_SLUGS)[number];

export function isPlanSlug(value: string): value is PlanSlug {
  return (PLAN_SLUGS as readonly string[]).includes(value);
}

// Quota values — null means unlimited (sur_mesure without override)
export type PlanQuotas = {
  maxProperties: number | null;
  maxActiveUnits: number | null;
  maxCollaborators: number | null;
  maxOrganizations: number | null;
};

// Current usage counters
export type PlanUsage = {
  activeProperties: number;
  activeUnits: number;
  collaborators: number;
};

// All valid feature identifiers (must match plan_features seeds in migration)
export const PLAN_FEATURES = [
  // Core (all plans)
  "properties",
  "units",
  "tenants",
  "leases",
  "dues",
  "payments_manual",
  "receipts",
  "tenant_portal",
  "notifications_basic",
  "documents_essential",
  // Essentiel+
  "contracts",
  "contract_templates_system",
  "collaborators",
  "exports_standard",
  // Avancé+
  "contract_templates_custom",
  "audit_advanced",
  "automation_advanced",
  "exports_advanced",
  "reminders_custom",
  "multi_organization",
  // Patrimoine+
  "reporting_consolidated",
  // Sur mesure only
  "api_access",
  "webhooks",
  "sso",
  "white_label",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

export function isPlanFeature(value: string): value is PlanFeature {
  return (PLAN_FEATURES as readonly string[]).includes(value);
}

// Full entitlements object returned by the server
export type OrganizationEntitlements = {
  organizationId: string;
  plan: PlanSlug;
  quotas: PlanQuotas;
  usage: PlanUsage;
  features: Set<PlanFeature>;
};

// Structured quota error codes (mirror SQL raise messages)
export const ENTITLEMENT_ERROR_CODES = [
  "PLAN_PROPERTY_LIMIT_REACHED",
  "PLAN_ACTIVE_UNIT_LIMIT_REACHED",
  "PLAN_COLLABORATOR_LIMIT_REACHED",
  "PLAN_ORGANIZATION_LIMIT_REACHED",
  "PLAN_FEATURE_NOT_AVAILABLE",
] as const;

export type EntitlementErrorCode = (typeof ENTITLEMENT_ERROR_CODES)[number];

export type EntitlementError = {
  code: EntitlementErrorCode;
  plan: PlanSlug;
  quota: number | null;
  current: number;
  /** Minimum plan that would allow the operation */
  suggestedUpgrade?: PlanSlug;
};

// Static quota table (mirrors migration's plan_quota_limits function)
export const PLAN_QUOTA_TABLE: Record<
  Exclude<PlanSlug, "sur_mesure">,
  PlanQuotas
> = {
  decouverte: {
    maxProperties: 1,
    maxActiveUnits: 3,
    maxCollaborators: 0,
    maxOrganizations: 1,
  },
  essentiel: {
    maxProperties: 3,
    maxActiveUnits: 10,
    maxCollaborators: 1,
    maxOrganizations: 1,
  },
  avance: {
    maxProperties: 10,
    maxActiveUnits: 30,
    maxCollaborators: 3,
    maxOrganizations: 2,
  },
  patrimoine: {
    maxProperties: 30,
    maxActiveUnits: 100,
    maxCollaborators: 10,
    maxOrganizations: 5,
  },
};

export const PLAN_LABELS: Record<PlanSlug, { fr: string; en: string }> = {
  decouverte: { fr: "Découverte", en: "Discovery" },
  essentiel: { fr: "Essentiel", en: "Essential" },
  avance: { fr: "Avancé", en: "Advanced" },
  patrimoine: { fr: "Patrimoine", en: "Patrimony" },
  sur_mesure: { fr: "Sur mesure", en: "Custom" },
};

/** Minimum plan slug that includes a given feature */
export function minimumPlanForFeature(feature: PlanFeature): PlanSlug {
  const map: Record<PlanFeature, PlanSlug> = {
    properties: "decouverte",
    units: "decouverte",
    tenants: "decouverte",
    leases: "decouverte",
    dues: "decouverte",
    payments_manual: "decouverte",
    receipts: "decouverte",
    tenant_portal: "decouverte",
    notifications_basic: "decouverte",
    documents_essential: "decouverte",
    contracts: "essentiel",
    contract_templates_system: "essentiel",
    collaborators: "essentiel",
    exports_standard: "essentiel",
    contract_templates_custom: "avance",
    audit_advanced: "avance",
    automation_advanced: "avance",
    exports_advanced: "avance",
    reminders_custom: "avance",
    multi_organization: "avance",
    reporting_consolidated: "patrimoine",
    api_access: "sur_mesure",
    webhooks: "sur_mesure",
    sso: "sur_mesure",
    white_label: "sur_mesure",
  };
  return map[feature];
}
