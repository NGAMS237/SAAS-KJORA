export const PARTNER_TERMS_VERSION = "pilot-2026-09-28";

export const PARTNER_TYPES = ["commercial", "referral_partner", "influencer", "agency"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export function isPartnerType(value: unknown): value is PartnerType {
  return typeof value === "string" && PARTNER_TYPES.includes(value as PartnerType);
}
