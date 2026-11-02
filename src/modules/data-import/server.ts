import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationEntitlements } from "@/core/entitlements/server";
import { ImportFileError, parseCsv } from "@/modules/data-import/csv";
import { parseXlsx } from "@/modules/data-import/xlsx";
import { checkFileSecurity, type FileMetadata } from "@/modules/data-import/security";
import { convertRentilaExports, isRentilaBiensFile, isRentilaLocatairesFile } from "@/modules/data-import/rentila";
import { suggestColumnMapping, applyMapping } from "@/modules/data-import/mapping";
import { normalizeRow } from "@/modules/data-import/normalize";
import { validateRow } from "@/modules/data-import/validation";
import { findDuplicateMatch, withFingerprints, type ExistingEntity } from "@/modules/data-import/dedup";
import type {
  ColumnMapping,
  CommitImportResult,
  CommitRowPayload,
  DuplicateCandidate,
  ImportHistoryEntry,
  ImportPreviewResult,
  ImportSource,
  NormalizedLeaseRow,
  QuotaConflict,
  ValidationIssue,
} from "@/modules/data-import/model";
import { MAX_IMPORT_ROWS } from "@/modules/data-import/model";
export { buildCommitPayload, type FinalizedRowInput } from "@/modules/data-import/commit-payload";

type TenantImportRow = { id: string; full_name: string; phone: string | null; email: string | null };

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseFile(source: ImportSource, buffer: Buffer) {
  return source === "csv" ? parseCsv(buffer.toString("utf8")) : parseXlsx(buffer);
}

export type CompanionFile = { metadata: FileMetadata; buffer: Buffer };
export type PreviewOptions = {
  /** Fichier Rentila « Locataires » accompagnant le fichier « Biens ». */
  companion?: CompanionFile;
  /** Nom commun du bien quand tous les logements Rentila sont dans le même immeuble. */
  propertyName?: string;
};

/**
 * Construit l'aperçu complet d'un import (§7 étapes 2 à 6, §8 : aucune écriture).
 * `columnMappingOverride` permet à l'utilisateur d'ajuster le mapping proposé
 * automatiquement (§7 étape 3) sans reparser le fichier depuis zéro côté client.
 */
export async function previewImport(
  organizationId: string,
  metadata: FileMetadata,
  buffer: Buffer,
  migrationAsOfDate: string,
  columnMappingOverride?: ColumnMapping[],
  options: PreviewOptions = {},
): Promise<ImportPreviewResult> {
  const source = checkFileSecurity(metadata);
  let parsedFile = parseFile(source, buffer);
  let fileHash = sha256Hex(buffer);
  let sourceNotes: string[] = [];
  const rentilaNotes = new Map<number, ValidationIssue[]>();

  if (isRentilaLocatairesFile(parsedFile.headers) && !isRentilaBiensFile(parsedFile.headers)) {
    throw new ImportFileError("IMPORT_RENTILA_WRONG_FILE", "Ce fichier est l'export Rentila « Locataires ». Choisissez le fichier « Biens » comme fichier principal et ajoutez celui-ci comme fichier Locataires.");
  }
  if (isRentilaBiensFile(parsedFile.headers)) {
    if (!options.companion) {
      throw new ImportFileError("IMPORT_RENTILA_COMPANION_MISSING", "Export Rentila détecté (Biens). Ajoutez aussi l'export Rentila « Locataires » pour reprendre les coordonnées et les soldes.");
    }
    const companionSource = checkFileSecurity(options.companion.metadata);
    const companionParsed = parseFile(companionSource, options.companion.buffer);
    if (!isRentilaLocatairesFile(companionParsed.headers)) {
      throw new ImportFileError("IMPORT_RENTILA_COMPANION_INVALID", "Le second fichier n'est pas un export Rentila « Locataires » (colonnes Prénom, Nom, Mobile, E-mail, Solde attendues).");
    }
    const conversion = convertRentilaExports(parsedFile, companionParsed, { migrationAsOfDate, propertyName: options.propertyName });
    parsedFile = conversion.file;
    fileHash = sha256Hex(Buffer.concat([buffer, options.companion.buffer]));
    for (const [rowNumber, notes] of conversion.notes) {
      rentilaNotes.set(rowNumber, notes.map((note) => ({ rowNumber, ...note })));
    }
    if (conversion.vacantUnits.length > 0) {
      sourceNotes = [`Logements sans locataire dans l'export Rentila (aucun bail créé) : ${conversion.vacantUnits.join(", ")}.`];
    }
  }
  if (parsedFile.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError("IMPORT_TOO_MANY_ROWS", `Le fichier contient ${parsedFile.rows.length} lignes, la limite est de ${MAX_IMPORT_ROWS}.`);
  }
  const columnMapping = columnMappingOverride ?? suggestColumnMapping(parsedFile);
  const mappedRows = applyMapping(parsedFile, columnMapping);

  const supabase = await createSupabaseServerClient();
  const [properties, units, tenants, activeLeases] = await Promise.all([
    supabase.from("properties").select("id, name, locality, type").eq("organization_id", organizationId).eq("status", "active").limit(2000),
    supabase.from("units").select("id, label, property_id").eq("organization_id", organizationId).eq("status", "active").limit(5000),
    supabase.rpc("list_tenants_for_import", { target_organization_id: organizationId }),
    supabase.from("leases").select("unit_id").eq("organization_id", organizationId).eq("status", "active").limit(5000),
  ]);
  for (const result of [properties, units, tenants, activeLeases]) {
    if (result.error) throw new Error(`data_import_context_read_failed: ${result.error.message}`);
  }
  const propertyEntities: ExistingEntity[] = (properties.data ?? []).map((p) => ({
    id: p.id, label: p.name, fingerprint: `property:${p.type}:${normalizeForFp(p.name)}:${normalizeForFp(p.locality)}`,
  }));
  const unitEntities: ExistingEntity[] = (units.data ?? []).map((u) => ({
    id: u.id, label: u.label, fingerprint: `unit:${u.property_id}:${normalizeForFp(u.label)}`, secondary: u.property_id,
  }));
  const tenantEntities: ExistingEntity[] = ((tenants.data ?? []) as TenantImportRow[]).map((t) => ({
    id: t.id, label: t.full_name, fingerprint: `tenant:${normalizeForFp(t.full_name)}:${normalizeForFp(t.phone ?? t.email ?? "")}`,
  }));
  const unitsWithActiveLease = new Set((activeLeases.data ?? []).map((l) => l.unit_id).filter(Boolean));

  const rows: ImportPreviewResult["rows"] = [];
  // Empreintes déjà rencontrées DANS ce fichier, pour détecter les doublons
  // intra-fichier (deux lignes qui décrivent le même bien/locataire) en plus
  // des doublons contre l'existant (§10).
  const seenPropertyFingerprints = new Map<string, number>();
  const seenTenantFingerprints = new Map<string, number>();

  for (const mapped of mappedRows) {
    const { row: baseRow, issues: normalizeIssues } = normalizeRow(mapped);
    const row = withFingerprints(baseRow);
    const issues = [...normalizeIssues, ...validateRow(row), ...(rentilaNotes.get(mapped.rowNumber) ?? [])];
    const duplicates: DuplicateCandidate[] = [];

    if (row.property.fingerprint && row.property.name) {
      const match = findDuplicateMatch(row.property.fingerprint, row.property.name, propertyEntities);
      if (match) {
        duplicates.push({ entityType: "property", fingerprint: row.property.fingerprint, existingId: match.id, existingLabel: match.label, matchedRowNumbers: [row.rowNumber] });
      }
      const seenAt = seenPropertyFingerprints.get(row.property.fingerprint);
      if (seenAt) issues.push({ rowNumber: row.rowNumber, field: "property_name", code: "IMPORT_PROPERTY_DUPLICATE_IN_FILE", severity: "warning", message: `Ce bien ressemble à celui de la ligne ${seenAt} du fichier.` });
      else seenPropertyFingerprints.set(row.property.fingerprint, row.rowNumber);
    }
    if (row.tenant.fingerprint && row.tenant.fullName) {
      const match = findDuplicateMatch(row.tenant.fingerprint, row.tenant.fullName, tenantEntities);
      if (match) {
        duplicates.push({ entityType: "tenant", fingerprint: row.tenant.fingerprint, existingId: match.id, existingLabel: match.label, matchedRowNumbers: [row.rowNumber] });
      }
      const seenAt = seenTenantFingerprints.get(row.tenant.fingerprint);
      if (seenAt) issues.push({ rowNumber: row.rowNumber, field: "tenant_full_name", code: "IMPORT_TENANT_DUPLICATE_IN_FILE", severity: "warning", message: `Ce locataire ressemble à celui de la ligne ${seenAt} du fichier.` });
      else seenTenantFingerprints.set(row.tenant.fingerprint, row.rowNumber);
    }
    if (row.unit.fingerprint && row.unit.label) {
      const propertyMatch = duplicates.find((d) => d.entityType === "property");
      const candidateUnits = propertyMatch ? unitEntities.filter((u) => u.secondary === propertyMatch.existingId) : [];
      const match = findDuplicateMatch(row.unit.fingerprint, row.unit.label, candidateUnits);
      if (match) {
        duplicates.push({ entityType: "unit", fingerprint: row.unit.fingerprint, existingId: match.id, existingLabel: match.label, matchedRowNumbers: [row.rowNumber] });
        if (unitsWithActiveLease.has(match.id)) {
          issues.push({ rowNumber: row.rowNumber, field: "unit_label", code: "IMPORT_UNIT_ALREADY_LEASED", severity: "error", message: "Ce logement a déjà un bail actif dans KJORA : importer un nouveau bail actif sur cette unité sera rejeté à l'import." });
        }
      }
    }

    rows.push({ rowNumber: row.rowNumber, normalized: row, issues, duplicates });
  }

  const validRowCount = rows.filter((r) => !r.issues.some((i) => i.severity === "error")).length;
  const warningRowCount = rows.filter((r) => r.issues.some((i) => i.severity === "warning") && !r.issues.some((i) => i.severity === "error")).length;
  const errorRowCount = rows.filter((r) => r.issues.some((i) => i.severity === "error")).length;

  const quotaConflict = await computeQuotaConflict(organizationId, rows.map((r) => r.normalized));

  return {
    fileName: metadata.fileName,
    fileSha256: fileHash,
    source,
    sourceNotes,
    columnMapping,
    totalRows: rows.length,
    validRowCount,
    warningRowCount,
    errorRowCount,
    rows,
    quotaConflict,
  };
}

function normalizeForFp(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Compare le nombre de nouveaux biens/logements que le fichier introduirait avec le quota restant du plan (§18). Affiché AVANT l'import, jamais après un import partiel silencieux. */
async function computeQuotaConflict(organizationId: string, rows: NormalizedLeaseRow[]): Promise<QuotaConflict | null> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) return null;

  const newPropertyFingerprints = new Set(
    rows.filter((r) => !r.property.existingId && r.property.fingerprint).map((r) => r.property.fingerprint as string),
  );
  const newUnitFingerprints = new Set(
    rows.filter((r) => !r.unit.existingId && r.unit.fingerprint && r.property.type === "building").map((r) => r.unit.fingerprint as string),
  );
  const requestedProperties = entitlements.usage.activeProperties + newPropertyFingerprints.size;
  const requestedUnits = entitlements.usage.activeUnits + newUnitFingerprints.size + rows.filter((r) => r.property.type === "house" && !r.property.existingId).length;

  if (entitlements.quotas.maxProperties !== null && requestedProperties > entitlements.quotas.maxProperties) {
    return { resource: "property", requested: requestedProperties, quota: entitlements.quotas.maxProperties, plan: entitlements.plan };
  }
  if (entitlements.quotas.maxActiveUnits !== null && requestedUnits > entitlements.quotas.maxActiveUnits) {
    return { resource: "unit", requested: requestedUnits, quota: entitlements.quotas.maxActiveUnits, plan: entitlements.plan };
  }
  return null;
}

export async function commitImport(
  organizationId: string,
  metadata: FileMetadata,
  fileSha256: string,
  source: ImportSource,
  migrationAsOfDate: string,
  rows: CommitRowPayload[],
): Promise<{ data: CommitImportResult | null; error: { code?: string; message?: string; details?: string } | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("commit_data_import", {
    target_organization_id: organizationId,
    migration_as_of_date: migrationAsOfDate,
    import_source: source,
    import_file_name: metadata.fileName,
    import_file_sha256: fileSha256,
    import_rows: rows,
  });
  if (error) return { data: null, error };
  const result = data as { already_imported: boolean; import_id: string; total_rows?: number; created_properties?: number; matched_properties?: number; created_units?: number; matched_units?: number; created_tenants?: number; matched_tenants?: number; created_leases?: number; skipped_rows?: number };
  return {
    data: {
      alreadyImported: result.already_imported,
      importId: result.import_id,
      totalRows: result.total_rows,
      createdProperties: result.created_properties,
      matchedProperties: result.matched_properties,
      createdUnits: result.created_units,
      matchedUnits: result.matched_units,
      createdTenants: result.created_tenants,
      matchedTenants: result.matched_tenants,
      createdLeases: result.created_leases,
      skippedRows: result.skipped_rows,
    },
    error: null,
  };
}

export async function listImportHistory(organizationId: string): Promise<ImportHistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_data_imports", { target_organization_id: organizationId });
  if (error || !data) return [];
  const rows = data as Array<{
    id: string; created_at: string; created_by_email: string | null; source: ImportSource; file_name: string;
    migration_as_of_date: string; total_rows: number; created_properties: number; matched_properties: number;
    created_units: number; matched_units: number; created_tenants: number; matched_tenants: number;
    created_leases: number; skipped_rows: number;
  }>;
  return rows.map((r) => ({
    id: r.id, createdAt: r.created_at, createdByEmail: r.created_by_email, source: r.source, fileName: r.file_name,
    migrationAsOfDate: r.migration_as_of_date, totalRows: r.total_rows, createdProperties: r.created_properties,
    matchedProperties: r.matched_properties, createdUnits: r.created_units, matchedUnits: r.matched_units,
    createdTenants: r.created_tenants, matchedTenants: r.matched_tenants, createdLeases: r.created_leases,
    skippedRows: r.skipped_rows,
  }));
}
