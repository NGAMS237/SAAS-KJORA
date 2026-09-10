import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseCsv, sanitizeForDisplay, ImportFileError } from "../src/modules/data-import/csv.ts";
import { checkFileSecurity } from "../src/modules/data-import/security.ts";
import { suggestColumnMapping, applyMapping, KJORA_NATIVE_PRESET } from "../src/modules/data-import/mapping.ts";
import { normalizeRow } from "../src/modules/data-import/normalize.ts";
import { validateRow } from "../src/modules/data-import/validation.ts";
import {
  propertyFingerprint,
  tenantFingerprint,
  isProbableNearDuplicate,
  findDuplicateMatch,
  withFingerprints,
} from "../src/modules/data-import/dedup.ts";
import { buildCommitPayload } from "../src/modules/data-import/commit-payload.ts";
import { IMPORT_TEMPLATE_HEADERS } from "../src/modules/data-import/xlsx.ts";
import { MAX_IMPORT_ROWS } from "../src/modules/data-import/model.ts";
import type { MappedRow, NormalizedLeaseRow } from "../src/modules/data-import/model.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260909160000_import_01_data_migration.sql", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// §11/§13/§14 : garanties structurelles de la migration (lues statiquement,
// en plus du gate SQL transactionnel déjà exécuté en direct contre Supabase).
// ---------------------------------------------------------------------------

test("la migration IMPORT-01 ne crée jamais de ligne dans payments", () => {
  assert.doesNotMatch(migration, /insert into public\.payments/i);
});

test("la migration IMPORT-01 est idempotente par empreinte de fichier (file_sha256)", () => {
  assert.match(migration, /data_imports_organization_file_key unique \(organization_id, file_sha256\)/);
  assert.match(migration, /already_imported/);
});

test("la migration IMPORT-01 déclare la capability data_import.manage en deny-by-default", () => {
  assert.match(migration, /'data_import\.manage'/);
  assert.match(migration, /has_capability\(target_organization_id, 'data_import\.manage'\)/);
});

test("la migration IMPORT-01 ne modifie aucune fonction/vue financière existante", () => {
  assert.doesNotMatch(migration, /create or replace function private\.generate_lease_dues/);
  assert.doesNotMatch(migration, /create or replace (view|function) public\.dues_with_status/);
});

// ---------------------------------------------------------------------------
// CSV parsing (§6, §20)
// ---------------------------------------------------------------------------

test("parseCsv gère guillemets, virgules et retours ligne échappés", () => {
  const csv = 'a,b,c\n"Ligne, avec virgule","texte ""cité""",simple\nx,y,z\n';
  const result = parseCsv(csv);
  assert.deepEqual(result.headers, ["a", "b", "c"]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].a, "Ligne, avec virgule");
  assert.equal(result.rows[0].b, 'texte "cité"');
});

test("parseCsv retire le BOM UTF-8 et ignore les lignes vides", () => {
  const csv = "﻿nom,age\n\nJean,30\n";
  const result = parseCsv(csv);
  assert.deepEqual(result.headers, ["nom", "age"]);
  assert.equal(result.rows.length, 1);
});

test("parseCsv refuse un fichier vide", () => {
  assert.throws(() => parseCsv(""), ImportFileError);
});

test("sanitizeForDisplay neutralise les déclencheurs de formule (protection CSV injection)", () => {
  assert.equal(sanitizeForDisplay("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(sanitizeForDisplay("+1234"), "'+1234");
  assert.equal(sanitizeForDisplay("Jean Dupont"), "Jean Dupont");
});

// ---------------------------------------------------------------------------
// Sécurité fichier (§20)
// ---------------------------------------------------------------------------

test("checkFileSecurity refuse un fichier trop volumineux, vide, ou .xlsm", () => {
  assert.throws(() => checkFileSecurity({ fileName: "x.csv", mimeType: "text/csv", sizeBytes: 0 }), ImportFileError);
  assert.throws(() => checkFileSecurity({ fileName: "x.csv", mimeType: "text/csv", sizeBytes: 999_999_999 }), ImportFileError);
  assert.throws(() => checkFileSecurity({ fileName: "macro.xlsm", mimeType: "application/vnd.ms-excel", sizeBytes: 100 }), ImportFileError);
  assert.throws(() => checkFileSecurity({ fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 100 }), ImportFileError);
});

test("checkFileSecurity accepte un .csv et un .xlsx dans les limites", () => {
  assert.equal(checkFileSecurity({ fileName: "import.csv", mimeType: "text/csv", sizeBytes: 1000 }), "csv");
  assert.equal(checkFileSecurity({ fileName: "import.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 1000 }), "xlsx");
});

// ---------------------------------------------------------------------------
// Mapping générique (§6, §23)
// ---------------------------------------------------------------------------

test("le preset KJORA reconnaît le modèle téléchargeable", () => {
  const mapping = KJORA_NATIVE_PRESET.detect([...IMPORT_TEMPLATE_HEADERS]);
  assert.ok(mapping);
  assert.equal(mapping?.find((m) => m.sourceColumn === "nom_bien")?.targetField, "property_name");
  assert.equal(mapping?.find((m) => m.sourceColumn === "nom_complet_locataire")?.targetField, "tenant_full_name");
});

test("suggestColumnMapping retombe sur un mapping vide si aucun preset ne reconnaît le fichier", () => {
  const suggestion = suggestColumnMapping({ headers: ["colonne_inconnue_1", "colonne_inconnue_2"], rows: [] });
  assert.ok(suggestion.every((entry) => entry.targetField === null));
});

test("applyMapping numérote les lignes à partir de 2 (ligne 1 = en-têtes)", () => {
  const parsed = { headers: ["nom_bien"], rows: [{ nom_bien: "Maison A" }, { nom_bien: "Maison B" }] };
  const mapped = applyMapping(parsed, [{ sourceColumn: "nom_bien", targetField: "property_name" }]);
  assert.equal(mapped[0].rowNumber, 2);
  assert.equal(mapped[1].rowNumber, 3);
  assert.equal(mapped[0].fields.property_name, "Maison A");
});

// ---------------------------------------------------------------------------
// Normalisation (formats, alias FR) + validation (§9)
// ---------------------------------------------------------------------------

function mappedRow(fields: MappedRow["fields"], rowNumber = 2): MappedRow {
  return { rowNumber, fields };
}

test("normalizeRow accepte les alias français des enums", () => {
  const { row, issues } = normalizeRow(mappedRow({
    property_type: "maison", lease_billing_frequency: "mensuel",
    opening_situation_kind: "dette", deposit_situation_status: "payé",
    tenant_phone: "699000000", security_deposit_xaf: "80000",
  }));
  assert.equal(row.property.type, "house");
  assert.equal(row.lease.billingFrequency, "monthly");
  assert.equal(row.lease.openingSituation.kind, "debt");
  assert.equal(row.lease.depositSituation.status, "paid");
  assert.equal(issues.length, 0);
});

test("normalizeRow signale un type de bien inconnu", () => {
  const { issues } = normalizeRow(mappedRow({ property_type: "chateau" }));
  assert.ok(issues.some((i) => i.code === "IMPORT_PROPERTY_TYPE_INVALID"));
});

test("normalizeRow signale une date de bail invalide et accepte AAAA-MM-JJ et JJ/MM/AAAA", () => {
  const invalid = normalizeRow(mappedRow({ lease_start_date: "31/02/2023" }));
  assert.ok(invalid.issues.some((i) => i.code === "IMPORT_LEASE_START_DATE_INVALID"));
  const iso = normalizeRow(mappedRow({ lease_start_date: "2023-03-01" }));
  assert.equal(iso.row.lease.startDate, "2023-03-01");
  const fr = normalizeRow(mappedRow({ lease_start_date: "01/03/2023" }));
  assert.equal(fr.row.lease.startDate, "2023-03-01");
});

test("normalizeRow exige un contact locataire (téléphone ou email)", () => {
  const { issues } = normalizeRow(mappedRow({ tenant_full_name: "Jean Dupont" }));
  assert.ok(issues.some((i) => i.code === "IMPORT_TENANT_CONTACT_MISSING"));
});

test("validateRow rejette un logement sans libellé pour un immeuble", () => {
  const { row } = normalizeRow(mappedRow({
    property_name: "Immeuble A", property_locality: "Douala", property_type: "building",
    tenant_full_name: "Jean Dupont", tenant_phone: "699000000",
    lease_start_date: "2026-01-01", lease_billing_frequency: "monthly", lease_base_rent_xaf: "50000",
  }));
  const issues = validateRow(row);
  assert.ok(issues.some((i) => i.code === "IMPORT_UNIT_LABEL_MISSING"));
});

test("validateRow accepte l'exemple canonique du cahier des charges (bail 2023, dette 3 mois)", () => {
  const { row, issues: normalizeIssues } = normalizeRow(mappedRow({
    property_name: "Maison Bonamoussadi", property_locality: "Douala", property_type: "house",
    tenant_full_name: "Jean Exemple Mballa", tenant_phone: "699000000",
    lease_start_date: "2023-03-01", lease_billing_frequency: "monthly", lease_due_day: "5",
    lease_base_rent_xaf: "80000", opening_situation_kind: "dette", opening_situation_amount_xaf: "240000",
    deposit_situation_status: "non_requis",
  }));
  const issues = [...normalizeIssues, ...validateRow(row)];
  assert.deepEqual(issues.filter((i) => i.severity === "error"), []);
  assert.equal(row.lease.openingSituation.kind, "debt");
  assert.equal(row.lease.openingSituation.amountXaf, 240000);
});

test("validateRow rejette un dépôt partiel hors bornes (0 ou >= requis)", () => {
  const base = {
    property_name: "Bien", property_locality: "Douala", property_type: "house",
    tenant_full_name: "Jean Dupont", tenant_phone: "699000000",
    lease_start_date: "2026-01-01", lease_billing_frequency: "monthly", lease_base_rent_xaf: "50000",
    security_deposit_xaf: "80000", deposit_situation_status: "partiel",
  };
  const zero = normalizeRow(mappedRow({ ...base, deposit_paid_amount_xaf: "0" }));
  assert.ok([...zero.issues, ...validateRow(zero.row)].some((i) => i.code === "IMPORT_DEPOSIT_PARTIAL_AMOUNT_INVALID"));
  const full = normalizeRow(mappedRow({ ...base, deposit_paid_amount_xaf: "80000" }));
  assert.ok([...full.issues, ...validateRow(full.row)].some((i) => i.code === "IMPORT_DEPOSIT_PARTIAL_AMOUNT_INVALID"));
  const ok = normalizeRow(mappedRow({ ...base, deposit_paid_amount_xaf: "30000" }));
  assert.ok(![...ok.issues, ...validateRow(ok.row)].some((i) => i.code === "IMPORT_DEPOSIT_PARTIAL_AMOUNT_INVALID"));
});

// ---------------------------------------------------------------------------
// Dédoublonnage (§10, §12)
// ---------------------------------------------------------------------------

test("propertyFingerprint est stable et insensible à la casse/accents/espaces", () => {
  const a = propertyFingerprint("Maison Bonamoussadi", "Douala, Bonamoussadi", "house");
  const b = propertyFingerprint("  MAISON   bonamoussadi ", "douala,   bonamoussadi", "house");
  assert.equal(a, b);
});

test("tenantFingerprint normalise le téléphone (espaces, tirets)", () => {
  const a = tenantFingerprint("Jean Dupont", "699 00 00 01", null);
  const b = tenantFingerprint("Jean Dupont", "699-00-00-01", null);
  assert.equal(a, b);
});

test("isProbableNearDuplicate détecte une petite faute de frappe mais pas deux noms différents", () => {
  assert.ok(isProbableNearDuplicate("Jean Dupont", "Jean Dupond"));
  assert.ok(!isProbableNearDuplicate("Jean Dupont", "Marie Curie"));
});

test("findDuplicateMatch propose une correspondance exacte puis approximative", () => {
  const existing = [{ id: "1", label: "Jean Dupont", fingerprint: "tenant:jean dupont:699000001" }];
  assert.equal(findDuplicateMatch("tenant:jean dupont:699000001", "Jean Dupont", existing)?.id, "1");
  assert.equal(findDuplicateMatch("tenant:autre", "Jean Dupond", existing)?.id, "1");
  assert.equal(findDuplicateMatch("tenant:autre", "Marie Curie", existing), null);
});

test("withFingerprints attache des empreintes cohérentes bien/logement/locataire", () => {
  const { row } = normalizeRow(mappedRow({
    property_name: "Immeuble A", property_locality: "Douala", property_type: "building",
    unit_label: "Appt 1", tenant_full_name: "Jean Dupont", tenant_phone: "699000000",
  }));
  const withFp = withFingerprints(row);
  assert.ok(withFp.property.fingerprint?.startsWith("property:building:"));
  assert.ok(withFp.unit.fingerprint?.startsWith("unit:"));
  assert.ok(withFp.tenant.fingerprint?.startsWith("tenant:"));
});

// ---------------------------------------------------------------------------
// Construction du payload de commit (§14 : jamais de Payment, dépôt isolé)
// ---------------------------------------------------------------------------

function normalizedRow(overrides: Partial<NormalizedLeaseRow> = {}): NormalizedLeaseRow {
  return {
    rowNumber: 2,
    skip: false,
    property: { action: "create", fingerprint: "property:house:x:y", existingId: null, name: "Maison", locality: "Douala", type: "house" },
    unit: { action: "create", fingerprint: null, existingId: null, label: null, type: null, areaSqm: null },
    tenant: { action: "create", fingerprint: "tenant:jean:699", existingId: null, fullName: "Jean Dupont", phone: "699000000", email: null },
    lease: {
      startDate: "2023-03-01", billingFrequency: "monthly", dueDay: 5, baseRentXaf: 80000, recurringChargesXaf: 0,
      openingSituation: { kind: "debt", amountXaf: 240000 },
      securityDepositXaf: 0,
      depositSituation: { status: "not_required", paidAmountXaf: 0 },
    },
    ...overrides,
  };
}

test("buildCommitPayload traduit une ligne 'skip' sans autre champ", () => {
  const payload = buildCommitPayload([{ rowNumber: 2, skip: true, row: normalizedRow(), duplicateResolutions: {} }]);
  assert.deepEqual(payload, [{ skip: true }]);
});

test("buildCommitPayload associe un bien existant sur résolution 'associate' explicite", () => {
  const payload = buildCommitPayload([{
    rowNumber: 2, skip: false, row: normalizedRow(),
    duplicateResolutions: { property: { resolution: "associate", existingId: "prop-123" } },
  }]);
  assert.deepEqual(payload[0].property, { action: "associate", type: "house", existing_id: "prop-123" });
});

test("buildCommitPayload transmet la situation d'ouverture et le dépôt sans jamais introduire de champ 'payment'", () => {
  const payload = buildCommitPayload([{ rowNumber: 2, skip: false, row: normalizedRow(), duplicateResolutions: {} }]);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /"payment/i);
  assert.equal(payload[0].lease?.opening_situation.kind, "debt");
  assert.equal(payload[0].lease?.opening_situation.amount_xaf, 240000);
});

test("buildCommitPayload force l'unité à 'associate' sans détail pour une maison entière", () => {
  const payload = buildCommitPayload([{ rowNumber: 2, skip: false, row: normalizedRow(), duplicateResolutions: {} }]);
  assert.deepEqual(payload[0].unit, { action: "associate" });
});

// ---------------------------------------------------------------------------
// Garde-fou volumétrie (§9, cohérent avec la limite appliquée par la RPC)
// ---------------------------------------------------------------------------

test("MAX_IMPORT_ROWS correspond à la limite appliquée par commit_data_import", () => {
  assert.equal(MAX_IMPORT_ROWS, 500);
  assert.match(migration, /max_rows constant integer := 500/);
});
