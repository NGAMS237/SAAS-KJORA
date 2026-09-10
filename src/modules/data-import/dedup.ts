// IMPORT-01 — empreintes et détection de doublons probables (§10, §12).
//
// Les empreintes sont déterministes et stables entre deux imports du même
// fichier (idempotence), et suffisamment normalisées pour absorber les
// petites variations d'orthographe/casse/espaces sans pour autant fusionner
// des entités réellement différentes (§10 : jamais de fusion automatique
// silencieuse — on ne fait que PROPOSER un rapprochement, l'association
// reste un choix explicite de l'utilisateur).

import type { ImportPropertyType, NormalizedLeaseRow } from "./model.ts";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhone(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function propertyFingerprint(name: string, locality: string, type: ImportPropertyType): string {
  return `property:${type}:${normalizeText(name)}:${normalizeText(locality)}`;
}

export function unitFingerprint(propertyFingerprintValue: string, label: string): string {
  return `unit:${propertyFingerprintValue}:${normalizeText(label)}`;
}

export function tenantFingerprint(fullName: string, phone: string | null, email: string | null): string {
  const contact = phone ? normalizePhone(phone) : email ? normalizeText(email) : "";
  return `tenant:${normalizeText(fullName)}:${contact}`;
}

/** Distance de Levenshtein simple, utilisée uniquement pour un rapprochement approximatif à faible coût (chaînes courtes : noms/libellés). */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_unused, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : 1 + Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1]);
    }
  }
  return matrix[a.length][b.length];
}

/** true si deux libellés sont "probablement le même", au-delà d'une simple égalité d'empreinte (fautes de frappe, variante d'orthographe légère). */
export function isProbableNearDuplicate(a: string, b: string): boolean {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  if (normalizedA === normalizedB) return true;
  if (normalizedA.length < 4 || normalizedB.length < 4) return false;
  const distance = levenshtein(normalizedA, normalizedB);
  const threshold = Math.max(1, Math.floor(Math.min(normalizedA.length, normalizedB.length) * 0.2));
  return distance <= threshold;
}

export type ExistingEntity = { id: string; label: string; fingerprint: string; secondary?: string };

/** Trouve, pour une empreinte donnée, une correspondance exacte OU une correspondance approximative parmi les entités existantes. */
export function findDuplicateMatch(fingerprint: string, label: string, existing: ExistingEntity[]): ExistingEntity | null {
  const exact = existing.find((entity) => entity.fingerprint === fingerprint);
  if (exact) return exact;
  const near = existing.find((entity) => isProbableNearDuplicate(entity.label, label));
  return near ?? null;
}

/** Attache empreintes calculées à une ligne normalisée (mutation locale, pure sinon). */
export function withFingerprints(row: NormalizedLeaseRow): NormalizedLeaseRow {
  const propertyFp = row.property.name && row.property.type
    ? propertyFingerprint(row.property.name, row.property.locality ?? "", row.property.type)
    : null;
  const unitFp = propertyFp && row.unit.label ? unitFingerprint(propertyFp, row.unit.label) : null;
  const tenantFp = row.tenant.fullName
    ? tenantFingerprint(row.tenant.fullName, row.tenant.phone, row.tenant.email)
    : null;
  return {
    ...row,
    property: { ...row.property, fingerprint: propertyFp },
    unit: { ...row.unit, fingerprint: unitFp },
    tenant: { ...row.tenant, fingerprint: tenantFp },
  };
}
