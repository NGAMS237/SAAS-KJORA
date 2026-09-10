// IMPORT-01 — types partagés pour la migration de données (Rentila / CSV / Excel).
//
// Vocabulaire volontairement non comptable côté UI (§17 du cahier des charges) :
// ces types restent le langage interne/technique, la traduction utilisateur se
// fait dans les composants d'affichage.

export const IMPORT_SOURCES = ["csv", "xlsx"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_PROPERTY_TYPES = ["house", "building"] as const;
export type ImportPropertyType = (typeof IMPORT_PROPERTY_TYPES)[number];

export const IMPORT_UNIT_TYPES = ["apartment", "studio", "room", "shop", "office"] as const;
export type ImportUnitType = (typeof IMPORT_UNIT_TYPES)[number];

export const IMPORT_BILLING_FREQUENCIES = ["monthly", "quarterly", "semiannual", "annual"] as const;
export type ImportBillingFrequency = (typeof IMPORT_BILLING_FREQUENCIES)[number];

export const OPENING_SITUATION_KINDS = ["even", "debt", "credit"] as const;
export type OpeningSituationKind = (typeof OPENING_SITUATION_KINDS)[number];

export const DEPOSIT_SITUATION_STATUSES = ["not_required", "due", "partial", "paid"] as const;
export type DepositSituationStatus = (typeof DEPOSIT_SITUATION_STATUSES)[number];

export const IMPORT_ENTITY_KINDS = ["property", "unit", "tenant"] as const;
export type ImportEntityKind = (typeof IMPORT_ENTITY_KINDS)[number];

/** Une ligne brute telle que lue depuis le fichier, avant tout mapping. */
export type RawImportRow = Record<string, string>;

/** Résultat du parsing d'un fichier source (CSV ou XLSX). */
export type ParsedFile = {
  headers: string[];
  rows: RawImportRow[];
};

/** Une colonne du fichier source mappée vers un champ cible KJORA. */
export type ColumnMapping = {
  sourceColumn: string;
  targetField: ImportTargetField | null;
};

// La liste des champs cibles reconnus par le moteur de mapping générique.
// Volontairement plat : un futur ImportPreset (Rentila…) ne fera que
// pré-remplir ce mapping, sans changer le moteur lui-même (§23).
export const IMPORT_TARGET_FIELDS = [
  "property_name",
  "property_locality",
  "property_type",
  "unit_label",
  "unit_type",
  "unit_area_sqm",
  "tenant_full_name",
  "tenant_phone",
  "tenant_email",
  "lease_start_date",
  "lease_billing_frequency",
  "lease_due_day",
  "lease_base_rent_xaf",
  "lease_recurring_charges_xaf",
  "opening_situation_kind",
  "opening_situation_amount_xaf",
  "security_deposit_xaf",
  "deposit_situation_status",
  "deposit_paid_amount_xaf",
] as const;
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export const REQUIRED_TARGET_FIELDS: ImportTargetField[] = [
  "property_name",
  "property_locality",
  "property_type",
  "tenant_full_name",
  "lease_start_date",
  "lease_billing_frequency",
  "lease_base_rent_xaf",
];

/** Une ligne après mapping colonnes → champs KJORA, encore sous forme texte. */
export type MappedRow = {
  rowNumber: number;
  fields: Partial<Record<ImportTargetField, string>>;
};

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  rowNumber: number;
  field: ImportTargetField | null;
  code: string;
  severity: ValidationSeverity;
  message: string;
};

export type DuplicateCandidate = {
  entityType: ImportEntityKind;
  fingerprint: string;
  existingId: string;
  existingLabel: string;
  matchedRowNumbers: number[];
};

/** Choix explicite de l'utilisateur pour un doublon détecté (§10). */
export type DuplicateResolution = "create" | "associate" | "ignore";

export type NormalizedLeaseRow = {
  rowNumber: number;
  skip: boolean;
  property: {
    action: "create" | "associate";
    fingerprint: string | null;
    existingId: string | null;
    name: string | null;
    locality: string | null;
    type: ImportPropertyType | null;
  };
  unit: {
    action: "create" | "associate";
    fingerprint: string | null;
    existingId: string | null;
    label: string | null;
    type: ImportUnitType | null;
    areaSqm: number | null;
  };
  tenant: {
    action: "create" | "associate";
    fingerprint: string | null;
    existingId: string | null;
    fullName: string | null;
    phone: string | null;
    email: string | null;
  };
  lease: {
    startDate: string | null;
    billingFrequency: ImportBillingFrequency | null;
    dueDay: number | null;
    baseRentXaf: number | null;
    recurringChargesXaf: number;
    openingSituation: { kind: OpeningSituationKind; amountXaf: number };
    securityDepositXaf: number;
    depositSituation: { status: DepositSituationStatus; paidAmountXaf: number };
  };
};

export type ImportPreviewRow = {
  rowNumber: number;
  normalized: NormalizedLeaseRow;
  issues: ValidationIssue[];
  duplicates: DuplicateCandidate[];
};

export type ImportPreviewResult = {
  fileName: string;
  fileSha256: string;
  source: ImportSource;
  columnMapping: ColumnMapping[];
  totalRows: number;
  validRowCount: number;
  warningRowCount: number;
  errorRowCount: number;
  rows: ImportPreviewRow[];
  quotaConflict: QuotaConflict | null;
};

export type QuotaConflict = {
  resource: "property" | "unit";
  requested: number;
  quota: number;
  plan: string;
};

/** Payload minimal envoyé à la RPC `commit_data_import` pour une ligne. */
export type CommitRowPayload = {
  skip?: boolean;
  property?: {
    action: "create" | "associate";
    fingerprint?: string;
    existing_id?: string;
    name?: string;
    locality?: string;
    type: ImportPropertyType;
  };
  unit?: {
    action: "create" | "associate";
    fingerprint?: string;
    existing_id?: string;
    label?: string;
    type?: ImportUnitType;
    area_sqm?: number;
  };
  tenant?: {
    action: "create" | "associate";
    fingerprint?: string;
    existing_id?: string;
    full_name?: string;
    phone?: string;
    email?: string;
  };
  lease?: {
    start_date: string;
    billing_frequency: ImportBillingFrequency;
    due_day?: number;
    base_rent_xaf: number;
    recurring_charges_xaf?: number;
    security_deposit_xaf?: number;
    opening_situation: { kind: OpeningSituationKind; amount_xaf: number };
    deposit_situation: { status: DepositSituationStatus; paid_amount_xaf?: number };
  };
};

export type ImportHistoryEntry = {
  id: string;
  createdAt: string;
  createdByEmail: string | null;
  source: ImportSource;
  fileName: string;
  migrationAsOfDate: string;
  totalRows: number;
  createdProperties: number;
  matchedProperties: number;
  createdUnits: number;
  matchedUnits: number;
  createdTenants: number;
  matchedTenants: number;
  createdLeases: number;
  skippedRows: number;
};

export type CommitImportResult = {
  alreadyImported: boolean;
  importId: string;
  totalRows?: number;
  createdProperties?: number;
  matchedProperties?: number;
  createdUnits?: number;
  matchedUnits?: number;
  createdTenants?: number;
  matchedTenants?: number;
  createdLeases?: number;
  skippedRows?: number;
};

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 Mo
export const ALLOWED_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
