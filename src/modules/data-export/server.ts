import "server-only";

// EXPORT-01 — lecture des données réelles de l'Organization active et
// génération des fichiers d'export (CSV / XLSX / ZIP).
//
// Toutes les lectures ci-dessous utilisent `createSupabaseServerClient()` —
// le client de l'utilisateur authentifié, jamais un client service-role —
// donc chaque requête reste filtrée par les RLS déjà en place sur chaque
// table (isolation Organization garantie par construction, comme pour la
// lecture de tout autre écran de l'application). Le filtre explicite
// `.eq("organization_id", organizationId)` est une seconde barrière
// défensive, pas la seule.
//
// Aucune écriture n'a lieu ici : ce module ne fait que lire et mettre en
// forme (§ EXPORT-01 principes, section 1 : "strictement read-only").

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildCsvDocument } from "@/modules/data-export/csv";
import { buildExportWorkbook, type ExportSheet } from "@/modules/data-export/xlsx";
import { buildZipArchive, type ZipEntry } from "@/modules/data-export/zip";
import { materializeFinancialDocument, createFinancialDocumentSignedUrl } from "@/modules/documents/server";
import type { FinancialDocumentRecord } from "@/modules/documents/model";
import {
  EXPORT_SCOPES,
  XLSX_STANDARD_SCOPES,
  type ExportHistoryEntry,
  type ExportRowCounts,
  type ExportScope,
} from "@/modules/data-export/model";

type DateRange = { from: string | null; to: string | null };

type ScopeData = { headers: string[]; rows: unknown[][] };
type ContractSummaryRow = {
  id: string;
  lease_id: string;
  tenant_id: string;
  reference: string;
  status: string;
  final_storage_path: string | null;
  created_at: string | null;
};

const SHEET_TITLES: Record<ExportScope, string> = {
  properties: "Biens",
  units: "Logements",
  tenants: "Locataires",
  leases: "Locations",
  dues: "Échéances",
  payments: "Paiements",
  payment_allocations: "Allocations",
  credits: "Crédits",
  deposits: "Dépôts",
  account_statements: "Situation des comptes",
  financial_documents: "Documents financiers",
  contracts: "Contrats",
};

function iso(value: string | null): string {
  return value ?? "";
}

async function readProperties(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("properties")
    .select("id, name, locality, type, status, created_at")
    .eq("organization_id", organizationId).order("created_at");
  if (error) throw error;
  return {
    headers: ["id", "nom", "localite", "type", "statut", "cree_le"],
    rows: (data ?? []).map((p) => [p.id, p.name, p.locality, p.type, p.status, iso(p.created_at)]),
  };
}

async function readUnits(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("units")
    .select("id, property_id, label, type, area_sqm, status, reference_rent_xaf, created_at")
    .eq("organization_id", organizationId).order("created_at");
  if (error) throw error;
  return {
    headers: ["id", "bien_id", "libelle", "type", "surface_m2", "statut", "loyer_reference_xaf", "cree_le"],
    rows: (data ?? []).map((u) => [u.id, u.property_id, u.label, u.type, u.area_sqm, u.status, u.reference_rent_xaf, iso(u.created_at)]),
  };
}

async function readTenants(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tenants")
    .select("id, full_name, phone, email, preferred_language, created_at")
    .eq("organization_id", organizationId).order("created_at");
  if (error) throw error;
  return {
    headers: ["id", "nom_complet", "telephone", "email", "langue", "cree_le"],
    rows: (data ?? []).map((t) => [t.id, t.full_name, t.phone, t.email, t.preferred_language, iso(t.created_at)]),
  };
}

async function readLeases(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("leases")
    .select("id, property_id, unit_id, tenant_id, status, start_date, end_date, base_rent_xaf, recurring_charges_xaf, periodic_total_xaf, security_deposit_xaf, billing_frequency, due_day, created_at")
    .eq("organization_id", organizationId).order("created_at");
  if (error) throw error;
  return {
    headers: ["id", "bien_id", "logement_id", "locataire_id", "statut", "date_debut", "date_fin", "loyer_base_xaf", "charges_recurrentes_xaf", "total_periodique_xaf", "depot_garantie_xaf", "frequence_paiement", "jour_echeance", "cree_le"],
    rows: (data ?? []).map((l) => [l.id, l.property_id, l.unit_id, l.tenant_id, l.status, iso(l.start_date), iso(l.end_date), l.base_rent_xaf, l.recurring_charges_xaf, l.periodic_total_xaf, l.security_deposit_xaf, l.billing_frequency, l.due_day, iso(l.created_at)]),
  };
}

async function readDues(organizationId: string, range: DateRange): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("dues_with_status")
    .select("id, lease_id, tenant_id, kind, reference, period_start, period_end, due_date, rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, adjustment_amount_xaf, adjustment_direction, expected_amount_xaf, remaining_amount_xaf, derived_status, created_at")
    .eq("organization_id", organizationId).order("due_date");
  if (range.from) query = query.gte("due_date", range.from);
  if (range.to) query = query.lte("due_date", range.to);
  const { data, error } = await query;
  if (error) throw error;
  return {
    headers: ["id", "location_id", "locataire_id", "type", "reference", "periode_debut", "periode_fin", "date_echeance", "loyer_xaf", "charges_xaf", "depot_xaf", "ajustement_xaf", "sens_ajustement", "montant_attendu_xaf", "montant_restant_xaf", "statut", "cree_le"],
    rows: (data ?? []).map((d) => [d.id, d.lease_id, d.tenant_id, d.kind, d.reference, iso(d.period_start), iso(d.period_end), iso(d.due_date), d.rent_amount_xaf, d.recurring_charges_amount_xaf, d.deposit_amount_xaf, d.adjustment_amount_xaf, d.adjustment_direction, d.expected_amount_xaf, d.remaining_amount_xaf, d.derived_status, iso(d.created_at)]),
  };
}

async function readPayments(organizationId: string, range: DateRange): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("payments")
    .select("id, lease_id, tenant_id, reference, amount_xaf, currency, payment_date, method, status, created_at")
    .eq("organization_id", organizationId).order("payment_date");
  if (range.from) query = query.gte("payment_date", range.from);
  if (range.to) query = query.lte("payment_date", range.to);
  const { data, error } = await query;
  if (error) throw error;
  return {
    headers: ["id", "location_id", "locataire_id", "reference", "montant_xaf", "devise", "date_paiement", "methode", "statut", "cree_le"],
    rows: (data ?? []).map((p) => [p.id, p.lease_id, p.tenant_id, p.reference, p.amount_xaf, p.currency, iso(p.payment_date), p.method, p.status, iso(p.created_at)]),
  };
}

async function readPaymentAllocations(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("payment_allocations")
    .select("id, payment_id, due_id, lease_id, tenant_id, amount_xaf, rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, adjustment_amount_xaf, created_at")
    .eq("organization_id", organizationId).order("created_at");
  if (error) throw error;
  return {
    headers: ["id", "paiement_id", "echeance_id", "location_id", "locataire_id", "montant_xaf", "part_loyer_xaf", "part_charges_xaf", "part_depot_xaf", "part_ajustement_xaf", "cree_le"],
    rows: (data ?? []).map((a) => [a.id, a.payment_id, a.due_id, a.lease_id, a.tenant_id, a.amount_xaf, a.rent_amount_xaf, a.recurring_charges_amount_xaf, a.deposit_amount_xaf, a.adjustment_amount_xaf, iso(a.created_at)]),
  };
}

// "Crédits" : mouvements de grand livre qui créditent le compte du locataire
// (crédit d'ouverture IMPORT-01/6C1, ou crédit d'un paiement) — jamais un
// Payment lui-même (voir IMPORT-01 §2 : le crédit d'ouverture n'est pas un
// paiement historique).
async function readCredits(organizationId: string, range: DateRange): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("ledger_entries")
    .select("id, lease_id, tenant_id, entry_type, reference, occurred_on, credit_xaf, created_at")
    .eq("organization_id", organizationId).gt("credit_xaf", 0)
    .in("entry_type", ["opening_credit", "payment"]).order("occurred_on");
  if (range.from) query = query.gte("occurred_on", range.from);
  if (range.to) query = query.lte("occurred_on", range.to);
  const { data, error } = await query;
  if (error) throw error;
  return {
    headers: ["id", "location_id", "locataire_id", "type", "reference", "survenu_le", "montant_credit_xaf", "cree_le"],
    rows: (data ?? []).map((c) => [c.id, c.lease_id, c.tenant_id, c.entry_type, c.reference, iso(c.occurred_on), c.credit_xaf, iso(c.created_at)]),
  };
}

// "Dépôts" : la Due de dépôt elle-même, plus les Dues d'ajustement qui la
// ciblent explicitement (dépôt déjà partiellement/totalement payé — voir
// IMPORT-01 §3, même mécanisme que `cancel_lease_future_dues`).
async function readDeposits(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const deposits = await supabase.from("dues")
    .select("id, lease_id, tenant_id, deposit_amount_xaf, due_date, created_at")
    .eq("organization_id", organizationId).eq("kind", "deposit").order("created_at");
  if (deposits.error) throw deposits.error;
  const depositIds = (deposits.data ?? []).map((d) => d.id);
  const adjustments = depositIds.length
    ? await supabase.from("dues")
      .select("id, lease_id, tenant_id, adjusted_due_id, adjustment_amount_xaf, adjustment_direction, created_at")
      .eq("organization_id", organizationId).eq("kind", "adjustment").in("adjusted_due_id", depositIds)
    : { data: [], error: null };
  if (adjustments.error) throw adjustments.error;
  const rows: unknown[][] = [
    ...(deposits.data ?? []).map((d) => [d.id, d.lease_id, d.tenant_id, "depot_exige", null, d.deposit_amount_xaf, iso(d.due_date), iso(d.created_at)]),
    ...(adjustments.data ?? []).map((a) => [a.id, a.lease_id, a.tenant_id, "ajustement", a.adjusted_due_id, a.adjustment_direction === "credit" ? a.adjustment_amount_xaf : -a.adjustment_amount_xaf, null, iso(a.created_at)]),
  ];
  return {
    headers: ["id", "location_id", "locataire_id", "type", "depot_id_cible", "montant_xaf", "date_echeance", "cree_le"],
    rows,
  };
}

// "Situation des comptes" : agrégat par Location, dérivé de dues_with_status
// (aucun recalcul de règle métier ici — simple somme des colonnes déjà
// calculées par la vue existante).
async function readAccountStatements(organizationId: string): Promise<ScopeData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("dues_with_status")
    .select("lease_id, tenant_id, expected_amount_xaf, remaining_amount_xaf, derived_status")
    .eq("organization_id", organizationId).neq("kind", "deposit");
  if (error) throw error;
  const byLease = new Map<string, { leaseId: string; tenantId: string; expected: number; remaining: number; overdueCount: number; totalCount: number }>();
  for (const row of data ?? []) {
    const key = row.lease_id as string;
    const entry = byLease.get(key) ?? { leaseId: row.lease_id, tenantId: row.tenant_id, expected: 0, remaining: 0, overdueCount: 0, totalCount: 0 };
    entry.expected += Number(row.expected_amount_xaf ?? 0);
    entry.remaining += Number(row.remaining_amount_xaf ?? 0);
    entry.totalCount += 1;
    if (row.derived_status === "overdue") entry.overdueCount += 1;
    byLease.set(key, entry);
  }
  const rows = Array.from(byLease.values()).map((e) => [
    e.leaseId, e.tenantId, e.expected, e.remaining, e.remaining > 0 ? "dette" : e.remaining < 0 ? "credit" : "a_jour", e.overdueCount, e.totalCount,
  ]);
  return {
    headers: ["location_id", "locataire_id", "total_attendu_xaf", "solde_restant_xaf", "situation", "echeances_en_retard", "echeances_totales"],
    rows,
  };
}

async function readFinancialDocumentsSummary(organizationId: string): Promise<{ data: ScopeData; records: FinancialDocumentRecord[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("financial_documents")
    .select("id, organization_id, tenant_id, lease_id, due_id, payment_id, document_type, reference, status, language, issued_on, period_start, period_end, snapshot, template_version, storage_path, created_by, created_at, invalidated_at, invalidation_reason")
    .eq("organization_id", organizationId).eq("status", "ready").order("issued_on");
  if (error) throw error;
  const records: FinancialDocumentRecord[] = (data ?? []).map((row) => ({
    id: row.id, organizationId: row.organization_id, tenantId: row.tenant_id, leaseId: row.lease_id,
    dueId: row.due_id, paymentId: row.payment_id, type: row.document_type, reference: row.reference,
    status: row.status, language: row.language, issuedOn: row.issued_on, periodStart: row.period_start,
    periodEnd: row.period_end, snapshot: row.snapshot as Record<string, unknown>, templateVersion: row.template_version,
    storagePath: row.storage_path, createdBy: row.created_by, createdAt: row.created_at,
    invalidatedAt: row.invalidated_at, invalidationReason: row.invalidation_reason, tenantEmail: null, lastDelivery: null,
  }));
  return {
    data: {
      headers: ["id", "type", "reference", "locataire_id", "location_id", "statut", "emis_le"],
      rows: records.map((r) => [r.id, r.type, r.reference, r.tenantId, r.leaseId, r.status, iso(r.issuedOn)]),
    },
    records,
  };
}

async function readContractsSummary(organizationId: string): Promise<{ data: ScopeData; contracts: Array<{ id: string; leaseId: string; reference: string; status: string; finalStoragePath: string | null }> }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_contracts_for_export", {
    target_organization_id: organizationId,
  });
  if (error) throw error;
  const contractRows = (data ?? []) as ContractSummaryRow[];
  const contracts = contractRows.map((c) => ({ id: c.id, leaseId: c.lease_id, reference: c.reference, status: c.status, finalStoragePath: c.final_storage_path }));
  return {
    data: {
      headers: ["id", "location_id", "locataire_id", "reference", "statut", "cree_le"],
      rows: contractRows.map((c) => [c.id, c.lease_id, c.tenant_id, c.reference, c.status, iso(c.created_at)]),
    },
    contracts,
  };
}

async function readScope(organizationId: string, scope: ExportScope, range: DateRange): Promise<ScopeData> {
  switch (scope) {
    case "properties": return readProperties(organizationId);
    case "units": return readUnits(organizationId);
    case "tenants": return readTenants(organizationId);
    case "leases": return readLeases(organizationId);
    case "dues": return readDues(organizationId, range);
    case "payments": return readPayments(organizationId, range);
    case "payment_allocations": return readPaymentAllocations(organizationId);
    case "credits": return readCredits(organizationId, range);
    case "deposits": return readDeposits(organizationId);
    case "account_statements": return readAccountStatements(organizationId);
    case "financial_documents": return (await readFinancialDocumentsSummary(organizationId)).data;
    case "contracts": return (await readContractsSummary(organizationId)).data;
    default: throw new Error(`unknown_export_scope: ${scope satisfies never}`);
  }
}

/** Compte les lignes de chaque scope demandé, pour l'aperçu avant génération (§4 UI : taille estimée). */
export async function estimateExportRowCounts(organizationId: string, scopes: ExportScope[], range: DateRange): Promise<ExportRowCounts> {
  const counts: ExportRowCounts = {};
  for (const scope of scopes) {
    const { rows } = await readScope(organizationId, scope, range);
    counts[scope] = rows.length;
  }
  return counts;
}

/** Génère un CSV pour un seul scope. */
export async function buildCsvExport(organizationId: string, scope: ExportScope, range: DateRange): Promise<Buffer> {
  const { headers, rows } = await readScope(organizationId, scope, range);
  return buildCsvDocument(headers, rows);
}

/** Génère le classeur XLSX multi-feuilles standard (Essentiel+, §2). */
export async function buildXlsxExport(organizationId: string, range: DateRange, scopes: ExportScope[] = XLSX_STANDARD_SCOPES): Promise<Buffer> {
  const sheets: ExportSheet[] = [];
  for (const scope of scopes) {
    const { headers, rows } = await readScope(organizationId, scope, range);
    sheets.push({ title: SHEET_TITLES[scope], headers, rows });
  }
  return buildExportWorkbook(sheets);
}

const MAX_ZIP_DOCUMENTS = 300; // garde-fou taille (§23 : pas de complexité inutile)

/** Génère l'export global ZIP (Avancé+, §2) : XLSX standard + documents PDF + contrats PDF + manifest. */
export async function buildZipExport(organizationId: string, range: DateRange): Promise<Buffer> {
  const [xlsx, documentsSummary, contractsSummary] = await Promise.all([
    buildXlsxExport(organizationId, range, [...XLSX_STANDARD_SCOPES]),
    readFinancialDocumentsSummary(organizationId),
    readContractsSummary(organizationId),
  ]);

  const entries: ZipEntry[] = [{ name: "data.xlsx", data: xlsx }];
  const manifest: Array<{ file: string; type: string; reference: string; status: string }> = [
    { file: "data.xlsx", type: "workbook", reference: "data", status: "ready" },
  ];

  const documentRecords = documentsSummary.records.slice(0, MAX_ZIP_DOCUMENTS);
  for (const record of documentRecords) {
    try {
      // Bucket privé, jamais public (§22) : on matérialise puis on lit les octets
      // via une URL signée de courte durée, jamais un chemin de bucket exposé.
      const storagePath = await materializeFinancialDocument(record);
      if (typeof storagePath !== "string") continue; // document invalidé : pas de PDF à inclure
      const signedUrl = await createFinancialDocumentSignedUrl(storagePath);
      const response = await fetch(signedUrl);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const fileName = `documents-financiers/${record.reference}.pdf`;
      entries.push({ name: fileName, data: bytes });
      manifest.push({ file: fileName, type: record.type, reference: record.reference, status: record.status });
    } catch {
      // Un document individuel indisponible ne doit jamais faire échouer tout l'export.
      continue;
    }
  }

  const contractRecords = contractsSummary.contracts.slice(0, MAX_ZIP_DOCUMENTS);
  for (const contract of contractRecords) {
    if (!contract.finalStoragePath) continue; // contrat non finalisé : pas encore de PDF
    try {
      const supabase = await createSupabaseServerClient();
      const signed = await supabase.storage.from("contract-documents").createSignedUrl(contract.finalStoragePath, 120, { download: true });
      if (signed.error) continue;
      const response = await fetch(signed.data.signedUrl);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const fileName = `contrats/${contract.reference}.pdf`;
      entries.push({ name: fileName, data: bytes });
      manifest.push({ file: fileName, type: "contract", reference: contract.reference, status: contract.status });
    } catch {
      continue;
    }
  }

  entries.push({
    name: "manifest.json",
    data: Buffer.from(JSON.stringify({
      organizationId,
      generatedAt: new Date().toISOString(),
      range,
      files: manifest,
      note: "data.xlsx est réimportable en partie via KJORA IMPORT-01 (voir docs/product/KJORA-DATA-EXPORT-v0.1.md). Les documents PDF sont fournis à titre informatif uniquement.",
    }, null, 2), "utf8"),
  });

  return buildZipArchive(entries);
}

// `scopesForFormat` vit désormais dans model.ts (fonction pure, sans E/S) —
// ré-exportée ici pour que les appelants existants (ex. app/api/data-export)
// n'aient rien à changer.
export { scopesForFormat } from "@/modules/data-export/model";

/** Historique des exports déjà demandés par cette Organization (§4 UI + §24 audit). */
export async function listExportHistory(organizationId: string): Promise<ExportHistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("data_exports")
    .select("id, format, scope, status, row_counts, requested_at, downloaded_at, downloaded_count")
    .eq("organization_id", organizationId)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    id: row.id,
    format: row.format,
    scope: row.scope as string[],
    status: row.status,
    rowCounts: (row.row_counts ?? {}) as ExportHistoryEntry["rowCounts"],
    requestedAt: row.requested_at,
    downloadedAt: row.downloaded_at,
    downloadedCount: Number(row.downloaded_count ?? 0),
  }));
}

export { EXPORT_SCOPES };
