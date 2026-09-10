// IMPORT-01 — moteur de mapping colonnes -> champs KJORA (§6, §23).
//
// Architecture volontairement générique : un "preset" n'est qu'une fonction
// qui propose un mapping par défaut à partir des en-têtes détectés. Le KJORA
// preset ci-dessous reconnaît notre propre modèle téléchargeable. Un futur
// ImportPreset Rentila viendra s'ajouter à la liste PRESETS sans changer le
// moteur (buildColumnMapping / applyMapping) ni le format de sortie
// (MappedRow), une fois qu'un export Rentila réel aura été inspecté — on ne
// code jamais contre un format Rentila supposé (§6).

import type { ColumnMapping, ImportTargetField, MappedRow, ParsedFile, RawImportRow } from "./model.ts";
import { IMPORT_TARGET_FIELDS } from "./model.ts";

export type ImportPreset = {
  id: string;
  label: string;
  /** Retourne le mapping proposé pour ces en-têtes, ou null si le preset ne reconnaît pas ce fichier. */
  detect: (headers: string[]) => ColumnMapping[] | null;
};

// Reconnaît les en-têtes normalisés (minuscules, sans accents ni parenthèses) du modèle KJORA-IMPORT-TEMPLATE.xlsx.
const KJORA_HEADER_TO_FIELD: Record<string, ImportTargetField> = {
  "nom_bien": "property_name",
  "localite_bien": "property_locality",
  "type_bien": "property_type",
  "libelle_logement": "unit_label",
  "type_logement": "unit_type",
  "nom_complet_locataire": "tenant_full_name",
  "telephone_locataire": "tenant_phone",
  "email_locataire": "tenant_email",
  "date_debut_bail": "lease_start_date",
  "frequence_paiement": "lease_billing_frequency",
  "jour_echeance": "lease_due_day",
  "loyer_base_xaf": "lease_base_rent_xaf",
  "charges_recurrentes_xaf": "lease_recurring_charges_xaf",
  "situation_ouverture": "opening_situation_kind",
  "montant_ouverture_xaf": "opening_situation_amount_xaf",
  "depot_garantie_xaf": "security_deposit_xaf",
  "statut_depot": "deposit_situation_status",
  "montant_depot_deja_paye_xaf": "deposit_paid_amount_xaf",
};

/** Normalise un en-tête pour la reconnaissance : minuscule, accents retirés, tout ce qui suit une parenthèse coupé. */
function normalizeHeader(header: string): string {
  return header
    .split("(")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export const KJORA_NATIVE_PRESET: ImportPreset = {
  id: "kjora_native",
  label: "Modèle KJORA",
  detect(headers) {
    const mapping = headers.map((sourceColumn) => ({
      sourceColumn,
      targetField: KJORA_HEADER_TO_FIELD[normalizeHeader(sourceColumn)] ?? null,
    }));
    const recognizedCount = mapping.filter((entry) => entry.targetField !== null).length;
    // On exige au moins la moitié des champs cibles pour proposer ce preset automatiquement.
    if (recognizedCount < IMPORT_TARGET_FIELDS.length / 2) return null;
    return mapping;
  },
};

// Emplacement réservé pour un futur preset Rentila (§23) — non implémenté tant
// qu'un export réel n'a pas été inspecté (§6, §29 : ne jamais inventer un
// format Rentila supposé).
export const PRESETS: ImportPreset[] = [KJORA_NATIVE_PRESET];

/** Propose un mapping automatique par le premier preset qui reconnaît le fichier, sinon un mapping vide (§7 étape 3 = ajustement manuel). */
export function suggestColumnMapping(parsedFile: ParsedFile): ColumnMapping[] {
  for (const preset of PRESETS) {
    const suggestion = preset.detect(parsedFile.headers);
    if (suggestion) return suggestion;
  }
  return parsedFile.headers.map((sourceColumn) => ({ sourceColumn, targetField: null }));
}

/** Applique un mapping colonnes -> champs pour transformer les lignes brutes en lignes mappées (encore sous forme texte). */
export function applyMapping(parsedFile: ParsedFile, mapping: ColumnMapping[]): MappedRow[] {
  const columnToField = new Map(mapping.map((entry) => [entry.sourceColumn, entry.targetField]));
  return parsedFile.rows.map((row: RawImportRow, index: number) => {
    const fields: Partial<Record<ImportTargetField, string>> = {};
    for (const [sourceColumn, value] of Object.entries(row)) {
      const targetField = columnToField.get(sourceColumn);
      if (targetField) fields[targetField] = value;
    }
    return { rowNumber: index + 2, fields }; // +2 : ligne 1 = en-têtes, la 1re donnée est la ligne 2 du tableur.
  });
}
