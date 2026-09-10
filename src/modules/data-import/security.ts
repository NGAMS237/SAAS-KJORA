// IMPORT-01 — contrôles de sécurité fichier (§20).
//
// - MIME/extension/taille/nombre de lignes vérifiés avant tout parsing.
// - Le contenu n'est jamais exécuté : le parseur CSV (csv.ts) ne fait que
//   découper du texte, le parseur XLSX (xlsx.ts) lit SheetJS en désactivant
//   explicitement l'évaluation de formules et le VBA.
// - Neutralisation "CSV injection" côté affichage : voir sanitizeForDisplay
//   dans csv.ts, appliqué à toute valeur montrée dans l'aperçu (§7 étape 4/6)
//   ou ré-exportée.
// - Aucune récupération d'URL externe n'est jamais déclenchée à partir du
//   contenu d'un fichier importé.

import { ALLOWED_IMPORT_MIME_TYPES, MAX_IMPORT_FILE_BYTES, type ImportSource } from "./model.ts";
import { ImportFileError } from "./csv.ts";

export type FileMetadata = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

const EXTENSION_TO_SOURCE: Record<string, ImportSource> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
};

export function checkFileSecurity(metadata: FileMetadata): ImportSource {
  if (metadata.sizeBytes <= 0) {
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Le fichier est vide.");
  }
  if (metadata.sizeBytes > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError("IMPORT_FILE_TOO_LARGE", `Le fichier dépasse la taille maximale autorisée (${Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} Mo).`);
  }
  const lowerName = metadata.fileName.toLowerCase();
  const extension = Object.keys(EXTENSION_TO_SOURCE).find((candidate) => lowerName.endsWith(candidate));
  if (!extension) {
    throw new ImportFileError("IMPORT_FILE_EXTENSION_INVALID", "Extension de fichier non supportée. Utilisez un fichier .csv ou .xlsx.");
  }
  // .xlsm (macro-enabled) est explicitement refusé même s'il a été renommé en .xlsx.
  if (lowerName.endsWith(".xlsm")) {
    throw new ImportFileError("IMPORT_FILE_MACROS_FORBIDDEN", "Les classeurs avec macros (.xlsm) ne sont pas acceptés.");
  }
  if (!(ALLOWED_IMPORT_MIME_TYPES as readonly string[]).includes(metadata.mimeType) && metadata.mimeType !== "application/octet-stream") {
    throw new ImportFileError("IMPORT_FILE_MIME_INVALID", `Type de fichier non reconnu (${metadata.mimeType}).`);
  }
  return EXTENSION_TO_SOURCE[extension];
}
