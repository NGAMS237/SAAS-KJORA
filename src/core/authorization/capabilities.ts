export const INTERNAL_ROLES = [
  "organization_owner",
  "manager",
  "collector",
  "caretaker",
  "accountant",
  "viewer",
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export const CAPABILITIES = [
  "organization.view",
  "organization.profile.manage",
  "member.view",
  "member.manage",
  "property.view",
  "property.manage",
  "unit.view",
  "unit.manage",
  "tenant.view",
  "tenant.manage",
  "lease.view",
  "lease.manage",
  "due.view",
  "payment.view",
  "payment.record",
  "payment.correction.request",
  "receipt.view",
  "receipt.share",
  "activity.view",
  "audit.view",
  "tenant_portal.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isInternalRole(value: string): value is InternalRole {
  return (INTERNAL_ROLES as readonly string[]).includes(value);
}

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function hasCapability(
  capabilities: readonly Capability[],
  requested: Capability,
) {
  return capabilities.includes(requested);
}

export const ROLE_LABELS: Record<InternalRole, { fr: string; en: string }> = {
  organization_owner: { fr: "Organization Owner", en: "Organization Owner" },
  manager: { fr: "Gestionnaire", en: "Manager" },
  collector: { fr: "Encaisseur", en: "Collector" },
  caretaker: { fr: "Gardien", en: "Caretaker" },
  accountant: { fr: "Comptable", en: "Accountant" },
  viewer: { fr: "Consultation", en: "Viewer" },
};
