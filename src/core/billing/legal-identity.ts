// =============================================================================
// KJORA — Identité légale de l'émetteur des factures SaaS (REVENUE-LAUNCH-01 v3)
// =============================================================================
// Le marchand légal de la facturation SaaS N'EST PAS TRANCHÉ (décision
// réservée, jamais prise dans le code). Aucune dénomination sociale n'est
// donc codée en dur pour la facturation : l'identité est lue depuis la
// configuration serveur, et son absence est affichée honnêtement sur le
// document comme « émetteur légal non configuré » — jamais remplacée par une
// entité supposée.
//
// Module PUR : la source des variables est passée en paramètre (testable
// sans environnement). Aucune de ces valeurs n'est un secret, mais elles
// restent côté serveur (jamais préfixées NEXT_PUBLIC_) : seul le PDF généré
// par le serveur les affiche.
// =============================================================================

export type BillingLegalIdentity = {
  /** Dénomination sociale exacte de l'émetteur. */
  legalName: string;
  /** Adresse postale complète, sur une ligne. */
  address: string | null;
  /** Numéro d'immatriculation (RCCM, NEQ...), tel que fourni. */
  registrationNumber: string | null;
  /** Identifiant fiscal (NIU, TPS/TVQ...), tel que fourni. */
  taxId: string | null;
  /** Courriel de facturation, s'il doit apparaître sur la facture. */
  contactEmail: string | null;
};

export const BILLING_LEGAL_IDENTITY_ENV = {
  legalName: "KJORA_BILLING_LEGAL_NAME",
  address: "KJORA_BILLING_LEGAL_ADDRESS",
  registrationNumber: "KJORA_BILLING_LEGAL_REGISTRATION",
  taxId: "KJORA_BILLING_LEGAL_TAX_ID",
  contactEmail: "KJORA_BILLING_LEGAL_CONTACT_EMAIL",
} as const;

type EnvSource = Record<string, string | undefined>;

function clean(value: string | undefined, max: number): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Identité légale configurée, ou `null` si la dénomination sociale n'est pas
 * renseignée. Les autres champs sont facultatifs : jamais inventés.
 */
export function resolveBillingLegalIdentity(env: EnvSource): BillingLegalIdentity | null {
  const legalName = clean(env[BILLING_LEGAL_IDENTITY_ENV.legalName], 160);
  if (!legalName) return null;
  return {
    legalName,
    address: clean(env[BILLING_LEGAL_IDENTITY_ENV.address], 240),
    registrationNumber: clean(env[BILLING_LEGAL_IDENTITY_ENV.registrationNumber], 80),
    taxId: clean(env[BILLING_LEGAL_IDENTITY_ENV.taxId], 80),
    contactEmail: clean(env[BILLING_LEGAL_IDENTITY_ENV.contactEmail], 160),
  };
}

/** Lignes d'émetteur affichées sur le document (bilingue). */
export function legalIdentityLines(
  identity: BillingLegalIdentity | null,
  language: "fr" | "en",
): string[] {
  const fr = language === "fr";
  if (!identity) {
    return [fr
      ? "Émetteur légal non configuré — document provisoire."
      : "Legal issuer not configured — provisional document."];
  }
  const lines = [identity.legalName];
  if (identity.address) lines.push(identity.address);
  if (identity.registrationNumber) lines.push(`${fr ? "Immatriculation" : "Registration"} : ${identity.registrationNumber}`);
  if (identity.taxId) lines.push(`${fr ? "Identifiant fiscal" : "Tax ID"} : ${identity.taxId}`);
  if (identity.contactEmail) lines.push(identity.contactEmail);
  return lines;
}
