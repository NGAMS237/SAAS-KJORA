// EXPORT-01 — écriture XLSX multi-feuilles (SheetJS), en écriture pure de
// valeurs : aucune formule n'est jamais écrite, donc aucune formule n'est
// jamais évaluée à l'ouverture. Les valeurs texte passent par
// `sanitizeForDisplay` (même neutralisation que le CSV, §6) au cas où un
// tableur réévaluerait une cellule commençant par =, +, - ou @ lors d'un
// copier-coller ultérieur.

import * as XLSX from "xlsx";
import { sanitizeForDisplay } from "../data-import/csv.ts";

export type ExportSheet = { title: string; headers: string[]; rows: unknown[][] };

function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return sanitizeForDisplay(String(value));
}

const MAX_SHEET_NAME_LENGTH = 31; // limite Excel historique

function safeSheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/*?:[\]]/g, " ").slice(0, MAX_SHEET_NAME_LENGTH).trim() || "Feuille";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, MAX_SHEET_NAME_LENGTH - 3)} ${suffix}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Construit un classeur XLSX multi-feuilles à partir de données déjà lues (aucun accès base ici). */
export function buildExportWorkbook(sheets: ExportSheet[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    const matrix = [sheet.headers, ...sheet.rows.map((row) => row.map(safeCell))];
    const worksheet = XLSX.utils.aoa_to_sheet(matrix);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheet.title, usedNames));
  }
  if (sheets.length === 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Aucune donnée pour ce périmètre."]]), "Export");
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
