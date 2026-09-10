// EXPORT-01 — écriture CSV.
//
// Réutilise la même neutralisation d'injection de formule que IMPORT-01
// (`sanitizeForDisplay`, §6 du cahier des charges EXPORT-01 : toute cellule
// commençant par =, +, -, @ est neutralisée) : une seule fonction, une seule
// source de vérité pour les deux sens (import et export).

import { sanitizeForDisplay } from "../data-import/csv.ts";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  const sanitized = sanitizeForDisplay(raw);
  if (/[",\n\r]/.test(sanitized)) return `"${sanitized.replace(/"/g, '""')}"`;
  return sanitized;
}

/** Construit un document CSV (UTF-8 avec BOM, pour une ouverture correcte dans Excel). */
export function buildCsvDocument(headers: string[], rows: unknown[][]): Buffer {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}
