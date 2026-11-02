// IMPORT-01 — parseur CSV minimal, sans dépendance externe.
//
// Volontairement strict : détecte le séparateur (virgule, point-virgule,
// tabulation) sur la ligne d'en-tête, gère les guillemets doubles, les
// champs contenant des virgules/retours-ligne échappés, et les fins de ligne
// \n / \r\n. Le contenu n'est jamais interprété comme du code (§20) : une
// cellule qui commence par =, +, -, @ (déclencheur de formule dans Excel/
// LibreOffice) est neutralisée à l'affichage par `sanitizeForDisplay`, jamais
// exécutée ici — ce module ne fait que produire des chaînes.

import type { ParsedFile, RawImportRow } from "./model.ts";

const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/;

export class ImportFileError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImportFileError";
    this.code = code;
  }
}

/** Neutralise une valeur pouvant déclencher une formule à l'ouverture dans un tableur (CSV injection). */
export function sanitizeForDisplay(value: string): string {
  if (FORMULA_TRIGGER_PATTERN.test(value)) return `'${value}`;
  return value;
}

/**
 * Détecte le séparateur de colonnes à partir de la ligne d'en-tête (hors
 * guillemets) : point-virgule (Excel/Rentila en locale FR), tabulation ou
 * virgule. En cas d'égalité ou d'absence de séparateur, la virgule reste le
 * défaut historique de KJORA.
 */
export function detectCsvDelimiter(content: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) break;
    if (!inQuotes && char in counts) counts[char] += 1;
  }
  let best = ",";
  for (const candidate of [";", "\t"]) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return best;
}

function parseCsvLines(content: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  // Dernière ligne sans retour final.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((line) => !(line.length === 1 && line[0] === ""));
}

const MAX_PARSED_ROWS = 5000; // garde-fou de parsing, distinct du MAX_IMPORT_ROWS métier (§20)

export function parseCsv(content: string): ParsedFile {
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1); // BOM UTF-8
  const lines = parseCsvLines(content, detectCsvDelimiter(content));
  if (lines.length === 0) throw new ImportFileError("IMPORT_FILE_EMPTY", "Le fichier ne contient aucune ligne.");
  if (lines.length - 1 > MAX_PARSED_ROWS) {
    throw new ImportFileError("IMPORT_FILE_TOO_LARGE", `Le fichier contient plus de ${MAX_PARSED_ROWS} lignes.`);
  }
  const headers = lines[0].map((header) => header.trim());
  const rows: RawImportRow[] = lines.slice(1)
    .filter((line) => line.some((cell) => cell.trim() !== ""))
    .map((line) => {
      const record: RawImportRow = {};
      headers.forEach((header, index) => {
        record[header] = (line[index] ?? "").trim();
      });
      return record;
    });
  return { headers, rows };
}
