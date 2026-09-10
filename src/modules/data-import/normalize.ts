// IMPORT-01 — normalisation d'une ligne mappée (texte) vers une structure typée.
//
// Ce module ne fait AUCUN accès réseau/DB : il transforme du texte en valeurs
// typées et signale les erreurs de format. La validation métier (§9) qui
// nécessite le contexte de l'Organization (doublons, quotas) vit dans
// validation.ts et server.ts.

import type {
  DepositSituationStatus,
  ImportBillingFrequency,
  ImportPropertyType,
  ImportUnitType,
  MappedRow,
  NormalizedLeaseRow,
  OpeningSituationKind,
  ValidationIssue,
} from "./model.ts";

// Alias FR acceptés en plus des valeurs canoniques, pour rester tolérant à la
// saisie humaine dans le modèle KJORA (§17 : vocabulaire non comptable).
const PROPERTY_TYPE_ALIASES: Record<string, ImportPropertyType> = {
  house: "house", maison: "house", "maison entiere": "house", "maison_entiere": "house",
  building: "building", immeuble: "building",
};
const UNIT_TYPE_ALIASES: Record<string, ImportUnitType> = {
  apartment: "apartment", appartement: "apartment",
  studio: "studio",
  room: "room", chambre: "room",
  shop: "shop", boutique: "shop", commerce: "shop",
  office: "office", bureau: "office",
};
const FREQUENCY_ALIASES: Record<string, ImportBillingFrequency> = {
  monthly: "monthly", mensuel: "monthly", mensuelle: "monthly",
  quarterly: "quarterly", trimestriel: "quarterly", trimestrielle: "quarterly",
  semiannual: "semiannual", semestriel: "semiannual", semestrielle: "semiannual",
  annual: "annual", annuel: "annual", annuelle: "annual",
};
const OPENING_KIND_ALIASES: Record<string, OpeningSituationKind> = {
  even: "even", "a_jour": "even", "a jour": "even",
  debt: "debt", dette: "debt",
  credit: "credit", "crédit": "credit",
};
const DEPOSIT_STATUS_ALIASES: Record<string, DepositSituationStatus> = {
  "not_required": "not_required", "non_requis": "not_required", "non requis": "not_required",
  due: "due", du: "due", "dû": "due",
  partial: "partial", partiel: "partial",
  paid: "paid", "payé": "paid", paye: "paid",
};

function normalizeToken(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function parseEnum<T extends string>(value: string | undefined, aliases: Record<string, T>): T | null {
  if (!value) return null;
  return aliases[normalizeToken(value)] ?? null;
}

function parseIntStrict(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const cleaned = value.replace(/[\s ]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function parseDateStrict(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const frMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  let year: number, month: number, day: number;
  if (isoMatch) {
    [, year, month, day] = isoMatch.map(Number) as unknown as [number, number, number, number];
  } else if (frMatch) {
    [, day, month, year] = frMatch.map(Number) as unknown as [number, number, number, number];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type NormalizeOutcome = { row: NormalizedLeaseRow; issues: ValidationIssue[] };

export function normalizeRow(mapped: MappedRow): NormalizeOutcome {
  const issues: ValidationIssue[] = [];
  const f = mapped.fields;
  const rowNumber = mapped.rowNumber;

  const propertyName = f.property_name?.trim() || null;
  const propertyLocality = f.property_locality?.trim() || null;
  const propertyType = parseEnum(f.property_type, PROPERTY_TYPE_ALIASES);
  if (f.property_type && !propertyType) {
    issues.push({ rowNumber, field: "property_type", code: "IMPORT_PROPERTY_TYPE_INVALID", severity: "error", message: `Type de bien inconnu : "${f.property_type}". Valeurs acceptées : maison entière, immeuble.` });
  }

  const unitType = parseEnum(f.unit_type, UNIT_TYPE_ALIASES);
  if (f.unit_type && !unitType) {
    issues.push({ rowNumber, field: "unit_type", code: "IMPORT_UNIT_TYPE_INVALID", severity: "error", message: `Type de logement inconnu : "${f.unit_type}".` });
  }
  const unitAreaSqm = f.unit_area_sqm ? parseIntStrict(f.unit_area_sqm) : null;

  const tenantFullName = f.tenant_full_name?.trim() || null;
  const tenantPhone = f.tenant_phone?.trim() || null;
  const tenantEmail = f.tenant_email?.trim() || null;
  if (tenantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenantEmail)) {
    issues.push({ rowNumber, field: "tenant_email", code: "IMPORT_TENANT_EMAIL_INVALID", severity: "error", message: `Adresse e-mail invalide : "${tenantEmail}".` });
  }
  if (!tenantPhone && !tenantEmail) {
    issues.push({ rowNumber, field: "tenant_phone", code: "IMPORT_TENANT_CONTACT_MISSING", severity: "error", message: "Au moins un téléphone ou un e-mail est requis pour le locataire." });
  }

  const startDate = parseDateStrict(f.lease_start_date);
  if (f.lease_start_date && !startDate) {
    issues.push({ rowNumber, field: "lease_start_date", code: "IMPORT_LEASE_START_DATE_INVALID", severity: "error", message: `Date de début de bail invalide : "${f.lease_start_date}" (attendu AAAA-MM-JJ).` });
  }
  const billingFrequency = parseEnum(f.lease_billing_frequency, FREQUENCY_ALIASES);
  if (f.lease_billing_frequency && !billingFrequency) {
    issues.push({ rowNumber, field: "lease_billing_frequency", code: "IMPORT_LEASE_FREQUENCY_INVALID", severity: "error", message: `Fréquence de paiement inconnue : "${f.lease_billing_frequency}".` });
  }
  const dueDay = f.lease_due_day ? parseIntStrict(f.lease_due_day) : null;
  const baseRentXaf = parseIntStrict(f.lease_base_rent_xaf);
  if (f.lease_base_rent_xaf && (baseRentXaf === null || baseRentXaf <= 0)) {
    issues.push({ rowNumber, field: "lease_base_rent_xaf", code: "IMPORT_LEASE_RENT_INVALID", severity: "error", message: "Le loyer de base doit être un nombre positif." });
  }
  const recurringChargesXaf = parseIntStrict(f.lease_recurring_charges_xaf) ?? 0;
  if (recurringChargesXaf < 0) {
    issues.push({ rowNumber, field: "lease_recurring_charges_xaf", code: "IMPORT_LEASE_CHARGES_INVALID", severity: "error", message: "Les charges récurrentes ne peuvent pas être négatives." });
  }

  const openingKind = parseEnum(f.opening_situation_kind, OPENING_KIND_ALIASES) ?? "even";
  if (f.opening_situation_kind && !parseEnum(f.opening_situation_kind, OPENING_KIND_ALIASES)) {
    issues.push({ rowNumber, field: "opening_situation_kind", code: "IMPORT_OPENING_SITUATION_INVALID", severity: "error", message: `Situation d'ouverture inconnue : "${f.opening_situation_kind}".` });
  }
  const openingAmountXaf = parseIntStrict(f.opening_situation_amount_xaf) ?? 0;
  if (openingAmountXaf < 0) {
    issues.push({ rowNumber, field: "opening_situation_amount_xaf", code: "IMPORT_OPENING_AMOUNT_NEGATIVE", severity: "error", message: "Le montant d'ouverture ne peut pas être négatif." });
  }

  const securityDepositXaf = parseIntStrict(f.security_deposit_xaf) ?? 0;
  const depositStatus = parseEnum(f.deposit_situation_status, DEPOSIT_STATUS_ALIASES) ?? "not_required";
  if (f.deposit_situation_status && !parseEnum(f.deposit_situation_status, DEPOSIT_STATUS_ALIASES)) {
    issues.push({ rowNumber, field: "deposit_situation_status", code: "IMPORT_DEPOSIT_STATUS_INVALID", severity: "error", message: `Statut de dépôt inconnu : "${f.deposit_situation_status}".` });
  }
  const depositPaidXaf = parseIntStrict(f.deposit_paid_amount_xaf) ?? 0;
  if (depositStatus !== "not_required" && securityDepositXaf <= 0) {
    issues.push({ rowNumber, field: "security_deposit_xaf", code: "IMPORT_DEPOSIT_REQUIRED_AMOUNT_INVALID", severity: "error", message: "Un montant de dépôt de garantie est requis quand un statut de dépôt est indiqué." });
  }
  if (depositStatus === "paid" && depositPaidXaf > 0 && depositPaidXaf !== securityDepositXaf) {
    issues.push({ rowNumber, field: "deposit_paid_amount_xaf", code: "IMPORT_DEPOSIT_PAID_MISMATCH", severity: "warning", message: "Le montant déjà payé sera aligné sur le montant du dépôt requis (statut = payé)." });
  }
  if (depositStatus === "partial" && (depositPaidXaf <= 0 || depositPaidXaf >= securityDepositXaf)) {
    issues.push({ rowNumber, field: "deposit_paid_amount_xaf", code: "IMPORT_DEPOSIT_PARTIAL_AMOUNT_INVALID", severity: "error", message: "Pour un dépôt partiel, le montant déjà payé doit être strictement compris entre 0 et le dépôt requis." });
  }
  if (depositPaidXaf > securityDepositXaf && securityDepositXaf > 0) {
    issues.push({ rowNumber, field: "deposit_paid_amount_xaf", code: "IMPORT_DEPOSIT_PAID_EXCEEDS_REQUIRED", severity: "error", message: "Le montant déjà payé ne peut pas dépasser le dépôt de garantie requis." });
  }

  const row: NormalizedLeaseRow = {
    rowNumber,
    skip: false,
    property: { action: "create", fingerprint: null, existingId: null, name: propertyName, locality: propertyLocality, type: propertyType },
    unit: { action: "create", fingerprint: null, existingId: null, label: f.unit_label?.trim() || null, type: unitType, areaSqm: unitAreaSqm },
    tenant: { action: "create", fingerprint: null, existingId: null, fullName: tenantFullName, phone: tenantPhone, email: tenantEmail },
    lease: {
      startDate, billingFrequency, dueDay, baseRentXaf,
      recurringChargesXaf,
      openingSituation: { kind: openingKind, amountXaf: openingAmountXaf },
      securityDepositXaf,
      depositSituation: { status: depositStatus, paidAmountXaf: depositPaidXaf },
    },
  };
  return { row, issues };
}
