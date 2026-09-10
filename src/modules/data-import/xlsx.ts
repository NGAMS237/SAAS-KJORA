// IMPORT-01 — lecture/écriture Excel (.xlsx) via SheetJS.
//
// Sécurité (§20) : lecture en mode "cellText"/"cellFormula:false" pour ne
// jamais évaluer une formule Excel — seules les valeurs affichées ou brutes
// sont lues, aucun code n'est exécuté. Les macros (.xlsm) ne sont pas des
// classeurs supportés (voir ALLOWED_IMPORT_MIME_TYPES) et un .xlsm renommé
// en .xlsx échouera simplement au parsing (SheetJS ignore le contenu VBA).

import * as XLSX from "xlsx";
import type { ParsedFile, RawImportRow } from "./model.ts";
import { ImportFileError } from "./csv.ts";

const MAX_PARSED_ROWS = 5000;

export function parseXlsx(buffer: Buffer): ParsedFile {
  let workbook: XLSX.WorkBook;
  try {
    // bookVBA: false + cellFormula: false -> le contenu VBA/formules n'est
    // jamais interprété, uniquement les valeurs statiques sont extraites.
    workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, bookVBA: false, cellHTML: false });
  } catch {
    throw new ImportFileError("IMPORT_FILE_UNREADABLE", "Le fichier Excel est illisible ou corrompu.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ImportFileError("IMPORT_FILE_EMPTY", "Le classeur ne contient aucune feuille.");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, raw: false, defval: "" });
  if (matrix.length === 0) throw new ImportFileError("IMPORT_FILE_EMPTY", "La feuille ne contient aucune ligne.");
  if (matrix.length - 1 > MAX_PARSED_ROWS) {
    throw new ImportFileError("IMPORT_FILE_TOO_LARGE", `Le fichier contient plus de ${MAX_PARSED_ROWS} lignes.`);
  }
  const headers = matrix[0].map((header) => String(header ?? "").trim());
  const rows: RawImportRow[] = matrix.slice(1)
    .filter((line) => line.some((cell) => String(cell ?? "").trim() !== ""))
    .map((line) => {
      const record: RawImportRow = {};
      headers.forEach((header, index) => {
        record[header] = String(line[index] ?? "").trim();
      });
      return record;
    });
  return { headers, rows };
}

// Colonnes du modèle plat "Import" — une ligne = un bail. C'est ce format
// flat (une ligne par location) que le moteur de mapping générique attend en
// entrée, y compris pour un futur ImportPreset Rentila (§23) : le bien, le
// logement et le locataire de chaque ligne sont résolus/dédupliqués côté
// serveur via empreinte (nom+localité, libellé, nom+téléphone), il n'y a pas
// besoin de plusieurs feuilles liées entre elles.
export const IMPORT_TEMPLATE_HEADERS = [
  "nom_bien",
  "localite_bien",
  "type_bien (house=maison entiere / building=immeuble)",
  "libelle_logement (vide si maison entiere)",
  "type_logement (apartment/studio/room/shop/office, vide si maison entiere)",
  "nom_complet_locataire",
  "telephone_locataire",
  "email_locataire",
  "date_debut_bail (AAAA-MM-JJ)",
  "frequence_paiement (monthly/quarterly/semiannual/annual)",
  "jour_echeance",
  "loyer_base_xaf",
  "charges_recurrentes_xaf",
  "situation_ouverture (a_jour/dette/credit)",
  "montant_ouverture_xaf",
  "depot_garantie_xaf",
  "statut_depot (non_requis/du/partiel/paye)",
  "montant_depot_deja_paye_xaf",
] as const;

/** Génère le classeur modèle téléchargeable KJORA-IMPORT-TEMPLATE.xlsx (§24). Exemples fictifs uniquement. */
export function buildImportTemplateWorkbook(): Buffer {
  const workbook = XLSX.utils.book_new();

  const importSheet = XLSX.utils.aoa_to_sheet([
    [...IMPORT_TEMPLATE_HEADERS],
    [
      "Maison Bonamoussadi", "Douala, Bonamoussadi", "house", "", "",
      "Jean Exemple Mballa", "699000000", "jean.exemple@example.com",
      "2023-03-01", "monthly", "5", "80000", "0",
      "dette", "240000", "160000", "paye", "160000",
    ],
    [
      "Immeuble Akwa Plaza", "Douala, Akwa", "building", "Appartement 1", "apartment",
      "Sarah Exemple Ngo", "677000000", "",
      "2026-09-01", "monthly", "5", "50000", "5000",
      "a_jour", "0", "0", "non_requis", "0",
    ],
  ]);
  // C'est CETTE feuille (toujours la première du classeur, quel que soit le
  // nom des feuilles suivantes) que parseXlsx() lit : le moteur d'import
  // reste un modèle plat "une ligne = une Location", volontairement simple
  // à dédupliquer par empreinte (§45 note ci-dessous). Elle est nommée
  // "Import" pour rester le point d'entrée univoque du remplissage.
  XLSX.utils.book_append_sheet(workbook, importSheet, "Import");

  // Feuilles de référence — non lues par le parseur (parseXlsx ne lit que
  // la feuille d'indice 0, "Import" ci-dessus). Elles reprennent le
  // vocabulaire métier (Biens / Logements / Locataires / Locations /
  // Situation d'ouverture) demandé pour aider au remplissage, sans jamais
  // modifier le format d'ingestion déjà testé et validé (pgTAP + tests
  // Node). Un futur IMPORT-02 pourra, si besoin, faire évoluer le classeur
  // vers un vrai modèle relationnel à onglets liés — décision volontairement
  // hors scope ici (voir DECISIONS.md).
  const bienColumns = IMPORT_TEMPLATE_HEADERS.slice(0, 2);
  const logementColumns = IMPORT_TEMPLATE_HEADERS.slice(2, 5);
  const locataireColumns = IMPORT_TEMPLATE_HEADERS.slice(5, 8);
  const locationColumns = IMPORT_TEMPLATE_HEADERS.slice(8, 13);
  const situationColumns = IMPORT_TEMPLATE_HEADERS.slice(13, 18);

  const referenceSheet = (title: string, description: string, columns: readonly string[]) =>
    XLSX.utils.aoa_to_sheet([
      [title],
      [""],
      [description],
      [""],
      ["Colonnes correspondantes dans la feuille \"Import\" :"],
      ...columns.map((column) => [`  • ${column}`]),
    ]);

  XLSX.utils.book_append_sheet(
    workbook,
    referenceSheet(
      "Biens",
      "Un Bien (\"house\" = maison entière, \"building\" = immeuble) est identifié par son nom et sa localité. Un même bien réparti sur plusieurs lignes (plusieurs logements/locations) doit reprendre EXACTEMENT le même nom et la même localité pour être reconnu comme un seul et même Bien.",
      bienColumns,
    ),
    "Biens",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    referenceSheet(
      "Logements",
      "Un Logement (studio, appartement, chambre, boutique, bureau) appartient à un Bien de type \"building\". Une maison entière (\"house\") n'a pas de colonnes Logement à renseigner : son unique logement est géré automatiquement par KJORA.",
      logementColumns,
    ),
    "Logements",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    referenceSheet(
      "Locataires",
      "Un Locataire est identifié par son nom complet et au moins un moyen de contact (téléphone ou e-mail).",
      locataireColumns,
    ),
    "Locataires",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    referenceSheet(
      "Locations",
      "Une Location (bail) associe un Bien, un Logement et un Locataire à une date de début réelle et des conditions de loyer. IMPORT-01 crée toujours une Location active neuve — il ne modifie jamais une Location existante.",
      locationColumns,
    ),
    "Locations",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    referenceSheet(
      "Situation d'ouverture",
      "Décrit l'état financier de la Location au jour de la migration (dette, crédit, ou à jour) et l'état du dépôt de garantie — toujours séparé du loyer. Voir la feuille \"Lisez-moi\" pour le détail des valeurs acceptées.",
      situationColumns,
    ),
    "Situation d'ouverture",
  );

  const noteSheet = XLSX.utils.aoa_to_sheet([
    ["KJORA — Modèle d'import de données"],
    [""],
    ["Ce fichier contient des exemples FICTIFS uniquement, à titre d'illustration du format attendu."],
    ["Remplacez les exemples par vos propres données avant import, dans la feuille \"Import\" uniquement."],
    ["Les feuilles Biens / Logements / Locataires / Locations / Situation d'ouverture sont des feuilles de"],
    ["référence pour vous aider à remplir les colonnes correspondantes — elles ne sont pas lues à l'import."],
    [""],
    ["Situation d'ouverture :"],
    ["  a_jour   : le locataire n'a aucun arriéré à la date de migration."],
    ["  dette    : le locataire doit un arriéré (montant_ouverture_xaf = montant total dû)."],
    ["  credit   : le locataire a payé d'avance (montant_ouverture_xaf = montant d'avance)."],
    [""],
    ["Statut du dépôt de garantie :"],
    ["  non_requis : aucun dépôt n'est exigé pour ce bail."],
    ["  du         : dépôt exigé, rien n'a encore été payé."],
    ["  partiel    : dépôt exigé, une partie a été payée (montant_depot_deja_paye_xaf > 0 et < depot_garantie_xaf)."],
    ["  paye       : dépôt exigé et intégralement payé."],
  ]);
  XLSX.utils.book_append_sheet(workbook, noteSheet, "Lisez-moi");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
