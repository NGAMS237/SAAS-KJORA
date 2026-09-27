// =============================================================================
// KJORA — Consentement marketing versionné (REVENUE-01I, v3)
// =============================================================================
// Version du texte de consentement actuellement présenté. Miroir EXACT de la
// liste fermée SQL (organization_commercial_contacts.consent_version et
// organization_marketing_consent_events.consent_version) : une nouvelle
// formulation exige une nouvelle version, donc une nouvelle migration — jamais
// une chaîne libre.
// =============================================================================

export const MARKETING_CONSENT_VERSION = "kjora-marketing-v1" as const;
export const MARKETING_CONSENT_VERSIONS = [MARKETING_CONSENT_VERSION] as const;
export type MarketingConsentVersion = (typeof MARKETING_CONSENT_VERSIONS)[number];

/** Preuve d'accord : même bornes que le SQL (3 à 500 caractères). */
export function isValidConsentEvidence(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}
