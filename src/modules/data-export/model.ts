// EXPORT-01 — modèle : formats, périmètre et types partagés.
//
// L'export est strictement en lecture : aucune fonction de ce module n'écrit
// jamais dans une table métier. La génération se fait à la demande, à partir
// des données réelles de l'Organization active, sous les RLS déjà en place
// (le client Supabase utilisé est celui de l'utilisateur authentifié, jamais
// un client service-role) — l'isolation Organization est donc garantie par
// construction, pas par une vérification applicative séparée.

export const EXPORT_FORMATS = ["csv", "xlsx", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

// Une "scope" = une feuille/table exportable. L'ordre correspond à celui des
// feuilles du classeur XLSX (§2 du cahier des charges).
export const EXPORT_SCOPES = [
  "properties",
  "units",
  "tenants",
  "leases",
  "dues",
  "payments",
  "payment_allocations",
  "credits",
  "deposits",
  "account_statements",
  "financial_documents",
  "contracts",
] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export function isExportScope(value: string): value is ExportScope {
  return (EXPORT_SCOPES as readonly string[]).includes(value);
}

// Scopes inclus par défaut pour un export CSV (une table à la fois) et pour
// la feuille "Import" d'un futur réimport KJORA (voir §3 doc) — colonnes
// stables, déjà documentées dans KJORA-DATA-EXPORT-v0.1.md.
export const CSV_DEFAULT_SCOPE: ExportScope = "properties";

// Scopes proposés pour l'export XLSX multi-feuilles standard (Essentiel+).
// Reprend les 9 feuilles indicatives du cahier des charges (§2) et ajoute
// "payment_allocations", explicitement dans le périmètre minimum (§1) mais
// absent de la liste illustrative de feuilles — les documents PDF (§1 :
// documents financiers, contrats) restent réservés au ZIP global (Avancé+),
// qui les inclut en plus de ce même classeur XLSX.
export const XLSX_STANDARD_SCOPES: ExportScope[] = [
  "properties",
  "units",
  "tenants",
  "leases",
  "dues",
  "payments",
  "payment_allocations",
  "credits",
  "deposits",
  "account_statements",
];

// Scopes additionnels inclus dans l'export global ZIP (Avancé+) : le XLSX
// standard + les documents PDF déjà générés (financiers et contrats).
export const ZIP_ADDITIONAL_SCOPES: ExportScope[] = ["financial_documents", "contracts"];

export type ExportRowCounts = Partial<Record<ExportScope, number>>;

export type ExportRequestResult = {
  exportId: string;
  format: ExportFormat;
  scope: ExportScope[];
  rowCounts: ExportRowCounts;
  estimatedBytes: number;
};

export type ExportHistoryEntry = {
  id: string;
  format: ExportFormat;
  scope: string[];
  status: "ready" | "failed";
  rowCounts: ExportRowCounts;
  requestedAt: string;
  downloadedAt: string | null;
  downloadedCount: number;
};

export class ExportError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ExportError";
    this.code = code;
    this.status = status;
  }
}

export function parseDateRange(input: Record<string, unknown>): { from: string | null; to: string | null } | null {
  const from = typeof input.from === "string" && input.from ? input.from : null;
  const to = typeof input.to === "string" && input.to ? input.to : null;
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return null;
  if (from && to && to < from) return null;
  return { from, to };
}

// Fonction pure (aucune E/S, aucun accès Supabase) : vit dans le modèle plutôt
// que dans server.ts pour rester testable sans tirer la chaîne de dépendances
// serveur (Supabase/Next), exactement comme les autres fonctions de ce
// fichier. Ré-exportée par server.ts pour ne rien changer côté appelants.
export function scopesForFormat(format: "csv" | "xlsx" | "zip", requested: string[]): ExportScope[] {
  if (format === "zip") return [...XLSX_STANDARD_SCOPES, ...ZIP_ADDITIONAL_SCOPES];
  if (format === "xlsx") {
    const valid = requested.filter(isExportScope);
    return valid.length ? valid : XLSX_STANDARD_SCOPES;
  }
  // csv : un seul scope à la fois
  const single = requested.find(isExportScope);
  return single ? [single] : ["properties"];
}
