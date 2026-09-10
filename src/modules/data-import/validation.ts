// IMPORT-01 — règles de validation §9 qui ne nécessitent pas d'accès DB
// (champs requis, cohérence interne à la ligne). Les règles qui nécessitent
// le contexte de l'Organization (doublons, conflits d'unité, quotas) vivent
// dans server.ts, qui les ajoute au même tableau de ValidationIssue.

import type { NormalizedLeaseRow, ValidationIssue } from "./model.ts";

export function validateRow(row: NormalizedLeaseRow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rowNumber = row.rowNumber;
  const push = (field: ValidationIssue["field"], code: string, severity: ValidationIssue["severity"], message: string) => {
    issues.push({ rowNumber, field, code, severity, message });
  };

  if (!row.property.name) push("property_name", "IMPORT_PROPERTY_NAME_MISSING", "error", "Le nom du bien est manquant.");
  if (!row.property.locality) push("property_locality", "IMPORT_PROPERTY_LOCALITY_MISSING", "error", "La localité du bien est manquante.");
  if (!row.property.type) push("property_type", "IMPORT_PROPERTY_TYPE_MISSING", "error", "Le type de bien (maison entière / immeuble) est manquant.");

  if (row.property.type === "building" && !row.unit.label) {
    push("unit_label", "IMPORT_UNIT_LABEL_MISSING", "error", "Le libellé du logement est requis pour un immeuble (ex. \"Appartement 1\").");
  }
  if (row.property.type === "building" && !row.unit.type) {
    push("unit_type", "IMPORT_UNIT_TYPE_MISSING", "error", "Le type de logement est requis pour un immeuble.");
  }
  if (row.property.type === "house" && row.unit.label) {
    push("unit_label", "IMPORT_UNIT_LABEL_IGNORED_FOR_HOUSE", "warning", "Une maison entière n'a qu'un seul logement ; le libellé fourni sera ignoré.");
  }

  if (!row.tenant.fullName) push("tenant_full_name", "IMPORT_TENANT_NAME_MISSING", "error", "Le nom du locataire est manquant.");
  else if (row.tenant.fullName.trim().length < 2) push("tenant_full_name", "IMPORT_TENANT_NAME_TOO_SHORT", "error", "Le nom du locataire est trop court.");

  if (!row.lease.startDate) push("lease_start_date", "IMPORT_LEASE_START_DATE_MISSING", "error", "La date de début de bail est manquante.");
  else {
    const today = new Date().toISOString().slice(0, 10);
    if (row.lease.startDate > today) push("lease_start_date", "IMPORT_LEASE_START_DATE_FUTURE", "error", "La date de début de bail ne peut pas être dans le futur.");
  }
  if (!row.lease.billingFrequency) push("lease_billing_frequency", "IMPORT_LEASE_FREQUENCY_MISSING", "error", "La fréquence de paiement est manquante.");
  if (row.lease.baseRentXaf === null) push("lease_base_rent_xaf", "IMPORT_LEASE_RENT_MISSING", "error", "Le loyer de base est manquant.");
  else if (row.lease.baseRentXaf <= 0) push("lease_base_rent_xaf", "IMPORT_LEASE_RENT_NON_POSITIVE", "error", "Le loyer de base doit être strictement positif.");

  if (row.lease.dueDay !== null && (row.lease.dueDay < 1 || row.lease.dueDay > 31)) {
    push("lease_due_day", "IMPORT_LEASE_DUE_DAY_INVALID", "error", "Le jour d'échéance doit être compris entre 1 et 31.");
  }

  // Cohérence dette/crédit approximative (avertissement) : la vérification
  // exacte, alignée sur le moteur d'échéances réel, est faite de manière
  // authoritative et bloquante au moment de la validation finale (RPC
  // commit_data_import, §13 — transaction atomique). Ici on ne fait que
  // signaler un cas manifestement incohérent pour guider l'utilisateur tôt
  // dans l'assistant (§7 étape 4), sans jamais se substituer au calcul exact.
  if (row.lease.openingSituation.kind === "debt" && row.lease.baseRentXaf && row.lease.startDate) {
    const monthsElapsed = Math.max(0, monthsBetween(row.lease.startDate, new Date().toISOString().slice(0, 10)) + 1);
    const roughExpected = monthsElapsed * (row.lease.baseRentXaf + row.lease.recurringChargesXaf);
    if (row.lease.openingSituation.amountXaf > roughExpected) {
      push("opening_situation_amount_xaf", "IMPORT_OPENING_BALANCE_SUSPECT", "warning",
        `La dette déclarée (${row.lease.openingSituation.amountXaf.toLocaleString("fr-FR")} XAF) dépasse le loyer total estimé depuis le début du bail (~${roughExpected.toLocaleString("fr-FR")} XAF). Ce point sera vérifié précisément à l'import.`);
    }
  }

  return issues;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}
