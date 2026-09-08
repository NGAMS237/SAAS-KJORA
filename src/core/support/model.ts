// =============================================================================
// Support — catalogue pur (aucune dépendance serveur, testable directement)
// =============================================================================

export const SUPPORT_CATEGORIES = [
  "connexion",
  "organisation",
  "biens_logements",
  "paiements_recus",
  "locataires_portail",
  "autre",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  connexion: "Connexion et accès",
  organisation: "Mon organisation",
  biens_logements: "Biens et logements",
  paiements_recus: "Paiements et reçus",
  locataires_portail: "Locataires et portail",
  autre: "Autre sujet",
};

export function isSupportCategory(value: unknown): value is SupportCategory {
  return typeof value === "string" && (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

/** Bornes du message : assez long pour être exploitable, borné pour l'email. */
export const SUPPORT_MESSAGE_MIN = 10;
export const SUPPORT_MESSAGE_MAX = 4000;

export function isValidSupportMessage(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length >= SUPPORT_MESSAGE_MIN
    && value.trim().length <= SUPPORT_MESSAGE_MAX;
}
