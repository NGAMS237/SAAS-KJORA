// IMPORT-01 — conversion d'un export Rentila (Biens + Locataires) vers le
// format plat KJORA « une ligne = un bail ».
//
// Les en-têtes ci-dessous ont été relevés sur un export Rentila réel (fichiers
// « Rentila-Biens.csv » et « Rentila-Locataires.csv », séparateur « ; »,
// UTF-8 avec BOM). Ce module est pur (aucun accès réseau/DB) : il ne produit
// qu'un ParsedFile au format du modèle KJORA, que le moteur de mapping
// (KJORA_NATIVE_PRESET), la normalisation et la validation existants traitent
// ensuite sans aucun changement.
//
// Ce que l'export Rentila ne contient PAS, et qui est donc supposé de façon
// explicite et signalée à l'utilisateur (avertissement par ligne) :
//  - la date de début de bail  -> date la plus récente compatible avec
//    l'arriéré déclaré (§ validation « situation suspecte »), jamais dans le futur ;
//  - la fréquence de paiement  -> mensuelle ;
//  - le dépôt de garantie      -> non requis.
// Rentila lie plusieurs locataires à un même bien ; KJORA n'en accepte qu'un
// par bail : le premier cité est importé, les autres sont signalés (jamais
// perdus en silence).

import type { ParsedFile, RawImportRow, ValidationIssue } from "./model.ts";

export type RentilaConversionOptions = {
  /** Date de migration AAAA-MM-JJ (situation arrêtée à cette date). */
  migrationAsOfDate: string;
  /** Nom commun du bien quand tous les logements sont dans le même immeuble ; sinon l'adresse Rentila est utilisée. */
  propertyName?: string;
};

export type RentilaRowNote = Pick<ValidationIssue, "field" | "code" | "severity" | "message">;

export type RentilaConversion = {
  file: ParsedFile;
  /** Notes par ligne de données (clé = numéro de ligne tableur, 1re donnée = 2). */
  notes: Map<number, RentilaRowNote[]>;
  /** Logements sans locataire dans l'export : aucun bail n'est créé pour eux. */
  vacantUnits: string[];
};

export const RENTILA_OUTPUT_HEADERS = [
  "nom_bien", "localite_bien", "type_bien", "libelle_logement", "type_logement",
  "nom_complet_locataire", "telephone_locataire", "email_locataire",
  "date_debut_bail", "frequence_paiement", "jour_echeance", "loyer_base_xaf", "charges_recurrentes_xaf",
  "situation_ouverture", "montant_ouverture_xaf", "depot_garantie_xaf", "statut_depot", "montant_depot_deja_paye_xaf",
] as const;

function key(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasHeaders(headers: string[], required: string[]): boolean {
  const normalized = new Set(headers.map(key));
  return required.every((header) => normalized.has(header));
}

export function isRentilaBiensFile(headers: string[]): boolean {
  return hasHeaders(headers, ["identifiant", "type", "adresse", "ville", "loyer", "charges", "locataires"]);
}

export function isRentilaLocatairesFile(headers: string[]): boolean {
  return hasHeaders(headers, ["prenom", "nom", "mobile", "e-mail", "solde"]);
}

/** Lecture d'une cellule par nom d'en-tête normalisé (insensible à la casse et aux accents). */
function cell(row: RawImportRow, header: string): string {
  for (const [name, value] of Object.entries(row)) {
    if (key(name) === header) return value.trim();
  }
  return "";
}

function toInt(value: string): number {
  const parsed = Number(value.replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

type RentilaTenant = { fullName: string; phone: string; email: string; balance: number };

function tenantIndex(locataires: ParsedFile): Map<string, RentilaTenant> {
  const index = new Map<string, RentilaTenant>();
  for (const row of locataires.rows) {
    const fullName = `${cell(row, "prenom")} ${cell(row, "nom")}`.replace(/\s+/g, " ").trim() || cell(row, "societe");
    if (!fullName) continue;
    index.set(key(fullName), {
      fullName,
      phone: cell(row, "mobile") || cell(row, "telephone"),
      email: cell(row, "e-mail"),
      balance: toInt(cell(row, "solde")),
    });
  }
  return index;
}

/** Premier jour du mois, `monthsBack` mois avant le mois de `reference`, en AAAA-MM-JJ (UTC). */
function firstOfMonthBack(reference: Date, monthsBack: number): string {
  const date = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - monthsBack, 1));
  return date.toISOString().slice(0, 10);
}

/**
 * Date de début supposée : la plus récente qui rend l'arriéré déclaré cohérent
 * avec le loyer (même raisonnement que la règle « situation suspecte » de
 * validation.ts). Sans arriéré : 1er jour du mois de migration.
 */
export function assumeLeaseStartDate(migrationAsOfDate: string, monthlyAmountXaf: number, debtXaf: number, today = new Date()): string {
  const asOf = new Date(`${migrationAsOfDate}T00:00:00Z`);
  const reference = Number.isNaN(asOf.getTime()) || asOf > today ? today : asOf;
  const months = debtXaf > 0 && monthlyAmountXaf > 0 ? Math.min(Math.ceil(debtXaf / monthlyAmountXaf), 240) : 1;
  return firstOfMonthBack(reference, months - 1);
}

export function convertRentilaExports(biens: ParsedFile, locataires: ParsedFile, options: RentilaConversionOptions): RentilaConversion {
  const tenants = tenantIndex(locataires);
  const rows: RawImportRow[] = [];
  const notes = new Map<number, RentilaRowNote[]>();
  const vacantUnits: string[] = [];
  const sharedPropertyName = options.propertyName?.trim() || "";

  for (const bien of biens.rows) {
    const unitLabel = cell(bien, "identifiant").replace(/\s+/g, " ");
    const names = cell(bien, "locataires").split(",").map((name) => name.trim()).filter(Boolean);
    if (names.length === 0) {
      if (unitLabel) vacantUnits.push(unitLabel);
      continue;
    }

    const [primaryName, ...otherNames] = names;
    const primary = tenants.get(key(primaryName)) ?? { fullName: primaryName.replace(/\s+/g, " "), phone: "", email: "", balance: 0 };
    const rent = toInt(cell(bien, "loyer"));
    const charges = toInt(cell(bien, "charges"));
    const debt = primary.balance < 0 ? -primary.balance : 0;
    const startDate = assumeLeaseStartDate(options.migrationAsOfDate, rent + charges, debt);
    const rentilaType = key(cell(bien, "type"));
    const isHouse = rentilaType === "maison";

    const output: RawImportRow = {
      nom_bien: sharedPropertyName || cell(bien, "adresse"),
      localite_bien: cell(bien, "ville"),
      type_bien: isHouse ? "maison" : "immeuble",
      libelle_logement: isHouse ? "" : unitLabel,
      type_logement: isHouse ? "" : cell(bien, "type"),
      nom_complet_locataire: primary.fullName,
      telephone_locataire: primary.phone,
      email_locataire: primary.email,
      date_debut_bail: startDate,
      frequence_paiement: "mensuel",
      jour_echeance: "",
      loyer_base_xaf: String(rent),
      charges_recurrentes_xaf: String(charges),
      situation_ouverture: primary.balance < 0 ? "dette" : primary.balance > 0 ? "credit" : "a jour",
      montant_ouverture_xaf: String(Math.abs(primary.balance)),
      depot_garantie_xaf: "0",
      statut_depot: "non requis",
      montant_depot_deja_paye_xaf: "0",
    };
    rows.push(output);

    const rowNumber = rows.length + 1;
    const rowNotes: RentilaRowNote[] = [{
      field: "lease_start_date",
      code: "IMPORT_RENTILA_ASSUMED_DEFAULTS",
      severity: "warning",
      message: `L'export Rentila ne contient ni date de début de bail ni fréquence de paiement : ${startDate} et « mensuel » ont été utilisés par défaut. À corriger si ce n'est pas exact.`,
    }];
    const skipped = otherNames.map((name) => {
      const other = tenants.get(key(name));
      return other && other.balance !== 0 ? `${other.fullName} (solde Rentila ${other.balance.toLocaleString("fr-FR")} XAF)` : (other?.fullName ?? name);
    });
    if (skipped.length > 0) {
      rowNotes.push({
        field: "tenant_full_name",
        code: "IMPORT_RENTILA_COTENANT_SKIPPED",
        severity: "warning",
        message: `KJORA n'accepte qu'un locataire par bail : ${skipped.join(", ")} n'est pas importé. À ajouter manuellement.`,
      });
    }
    notes.set(rowNumber, rowNotes);
  }

  return { file: { headers: [...RENTILA_OUTPUT_HEADERS], rows }, notes, vacantUnits };
}
