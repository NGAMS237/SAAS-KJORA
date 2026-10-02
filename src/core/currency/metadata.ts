// =============================================================================
// KJORA — AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A
// =============================================================================
// Point UNIQUE de métadonnées monétaires pour les devises de LOCATION (jamais
// la devise d'abonnement KJORA, qui reste gérée séparément par
// src/modules/platform-admin/money.ts — XAF/CAD, unité mineure). Objectif du
// mandat : « centraliser les métadonnées monétaires ... ne jamais disperser
// des `if (currency === ...)` dans l'app ».
//
// Décision de portée EXPLICITE pour ce lot (voir le rapport AFRICA-CONTRACTS-
// PERFORMANCE-01, AXE A) : les 57 colonnes `*_xaf` existantes restent des
// bigint stockant un montant en unité MAJEURE ENTIÈRE, quelle que soit la
// devise de l'Organization — aucune conversion mineure/majeure n'est
// introduite pour les montants locatifs dans ce lot (contrairement à la
// facturation SaaS, qui utilise déjà `amount_minor`). `decimals` ci-dessous
// ne pilote donc que l'AFFICHAGE et l'ARRONDI, jamais une division par 100 :
// c'est un choix assumé, pas un oubli — voir le commentaire en tête de la
// migration SQL de ce lot pour le raisonnement complet.
//
// Module PUR (pas de "server-only", pas de dépendance Supabase) : importable
// aussi bien depuis un composant serveur que client, testable par
// `node --test` sans environnement — même conventions que
// modules/platform-admin/money.ts et core/email/resend-transport.ts.
// =============================================================================

export const RENTAL_CURRENCIES = ["XAF", "XOF", "NGN", "CDF", "KES", "ZAR"] as const;
export type RentalCurrency = (typeof RENTAL_CURRENCIES)[number];

export function isRentalCurrency(value: unknown): value is RentalCurrency {
  return typeof value === "string" && (RENTAL_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Pays supportés pour une Organization de location, avec les valeurs
 * proposées par défaut à la création (§ mandat : « pays, devise, fuseau et
 * langue sont proposés à la création, avec des valeurs cohérentes avec le
 * pays »). Le pays ne CONTRAINT pas la devise choisie côté base (une
 * Organization reste libre de toute devise supportée tant qu'aucune
 * opération financière n'existe) : ces valeurs ne sont qu'une proposition.
 *
 * Zone XOF : les 8 pays membres de l'UEMOA (Bénin, Burkina Faso, Côte
 * d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal, Togo) — liste vérifiable,
 * non inventée.
 */
export type CountryDefaults = {
  countryCode: string;
  label: { fr: string; en: string };
  currency: RentalCurrency;
  timezone: string;
  language: "fr" | "en";
};

export const SUPPORTED_COUNTRIES: readonly CountryDefaults[] = [
  { countryCode: "CM", label: { fr: "Cameroun", en: "Cameroon" }, currency: "XAF", timezone: "Africa/Douala", language: "fr" },
  { countryCode: "SN", label: { fr: "Sénégal", en: "Senegal" }, currency: "XOF", timezone: "Africa/Dakar", language: "fr" },
  { countryCode: "CI", label: { fr: "Côte d'Ivoire", en: "Ivory Coast" }, currency: "XOF", timezone: "Africa/Abidjan", language: "fr" },
  { countryCode: "BJ", label: { fr: "Bénin", en: "Benin" }, currency: "XOF", timezone: "Africa/Porto-Novo", language: "fr" },
  { countryCode: "BF", label: { fr: "Burkina Faso", en: "Burkina Faso" }, currency: "XOF", timezone: "Africa/Ouagadougou", language: "fr" },
  { countryCode: "GW", label: { fr: "Guinée-Bissau", en: "Guinea-Bissau" }, currency: "XOF", timezone: "Africa/Bissau", language: "fr" },
  { countryCode: "ML", label: { fr: "Mali", en: "Mali" }, currency: "XOF", timezone: "Africa/Bamako", language: "fr" },
  { countryCode: "NE", label: { fr: "Niger", en: "Niger" }, currency: "XOF", timezone: "Africa/Niamey", language: "fr" },
  { countryCode: "TG", label: { fr: "Togo", en: "Togo" }, currency: "XOF", timezone: "Africa/Lome", language: "fr" },
  { countryCode: "NG", label: { fr: "Nigeria", en: "Nigeria" }, currency: "NGN", timezone: "Africa/Lagos", language: "en" },
  { countryCode: "CD", label: { fr: "RD Congo", en: "DR Congo" }, currency: "CDF", timezone: "Africa/Kinshasa", language: "fr" },
  { countryCode: "KE", label: { fr: "Kenya", en: "Kenya" }, currency: "KES", timezone: "Africa/Nairobi", language: "en" },
  { countryCode: "ZA", label: { fr: "Afrique du Sud", en: "South Africa" }, currency: "ZAR", timezone: "Africa/Johannesburg", language: "en" },
];

export type PhoneCountry = {
  countryCode: string;
  label: { fr: string; en: string };
  callingCode: string;
  nationalLength: number;
  nationalPattern: string;
  nationalExample: string;
};

/**
 * Catalogue ferme des numéros personnels utilisables dans KJORA. Il reprend
 * tous les pays immobiliers officiellement supportés et le Canada, marché de
 * facturation pilote. Chaque pays porte son propre motif de numéro national
 * significatif. Le zéro initial fait notamment partie du numéro pour CI et
 * BJ : aucun chiffre n'est ajouté, retiré ou déduit implicitement.
 */
export const SUPPORTED_PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { countryCode: "CA", label: { fr: "Canada", en: "Canada" }, callingCode: "1", nationalLength: 10, nationalPattern: "^[1-9][0-9]{9}$", nationalExample: "5145550100" },
  { countryCode: "CM", label: { fr: "Cameroun", en: "Cameroon" }, callingCode: "237", nationalLength: 9, nationalPattern: "^[1-9][0-9]{8}$", nationalExample: "699001122" },
  { countryCode: "SN", label: { fr: "Sénégal", en: "Senegal" }, callingCode: "221", nationalLength: 9, nationalPattern: "^[1-9][0-9]{8}$", nationalExample: "771234567" },
  { countryCode: "CI", label: { fr: "Côte d'Ivoire", en: "Ivory Coast" }, callingCode: "225", nationalLength: 10, nationalPattern: "^0[157][0-9]{8}$", nationalExample: "0701020304" },
  { countryCode: "BJ", label: { fr: "Bénin", en: "Benin" }, callingCode: "229", nationalLength: 10, nationalPattern: "^01[0-9]{8}$", nationalExample: "0197123456" },
  { countryCode: "BF", label: { fr: "Burkina Faso", en: "Burkina Faso" }, callingCode: "226", nationalLength: 8, nationalPattern: "^[1-9][0-9]{7}$", nationalExample: "70123456" },
  { countryCode: "GW", label: { fr: "Guinée-Bissau", en: "Guinea-Bissau" }, callingCode: "245", nationalLength: 9, nationalPattern: "^[1-9][0-9]{8}$", nationalExample: "955123456" },
  { countryCode: "ML", label: { fr: "Mali", en: "Mali" }, callingCode: "223", nationalLength: 8, nationalPattern: "^[1-9][0-9]{7}$", nationalExample: "76123456" },
  { countryCode: "NE", label: { fr: "Niger", en: "Niger" }, callingCode: "227", nationalLength: 8, nationalPattern: "^[1-9][0-9]{7}$", nationalExample: "90123456" },
  { countryCode: "TG", label: { fr: "Togo", en: "Togo" }, callingCode: "228", nationalLength: 8, nationalPattern: "^[1-9][0-9]{7}$", nationalExample: "90123456" },
  { countryCode: "NG", label: { fr: "Nigeria", en: "Nigeria" }, callingCode: "234", nationalLength: 10, nationalPattern: "^[1-9][0-9]{9}$", nationalExample: "8031234567" },
  { countryCode: "CD", label: { fr: "RD Congo", en: "DR Congo" }, callingCode: "243", nationalLength: 9, nationalPattern: "^[1-9][0-9]{8}$", nationalExample: "812345678" },
  { countryCode: "KE", label: { fr: "Kenya", en: "Kenya" }, callingCode: "254", nationalLength: 9, nationalPattern: "^[1-9][0-9]{8}$", nationalExample: "712345678" },
  { countryCode: "ZA", label: { fr: "Afrique du Sud", en: "South Africa" }, callingCode: "27", nationalLength: 9, nationalPattern: "^[1-9][0-9]{8}$", nationalExample: "821234567" },
];

export function phoneDefaultsForCountry(countryCode: string): PhoneCountry | null {
  return SUPPORTED_PHONE_COUNTRIES.find((entry) => entry.countryCode === countryCode) ?? null;
}

export function isSupportedCountry(value: string): boolean {
  return SUPPORTED_COUNTRIES.some((entry) => entry.countryCode === value);
}

export function defaultsForCountry(countryCode: string): CountryDefaults | null {
  return SUPPORTED_COUNTRIES.find((entry) => entry.countryCode === countryCode) ?? null;
}

/**
 * Décimales à afficher pour cette devise. XAF/XOF : 0 (aucune sous-unité en
 * usage). NGN/CDF/KES/ZAR/CAD : 2. Jamais utilisée pour diviser un montant
 * locatif par 100 (voir décision de portée en tête de fichier) — seulement
 * pour l'affichage et l'arrondi.
 */
const ZERO_DECIMAL_RENTAL_CURRENCIES = new Set<string>(["XAF", "XOF"]);

export function decimalsForRentalCurrency(currency: string): 0 | 2 {
  return ZERO_DECIMAL_RENTAL_CURRENCIES.has(currency) ? 0 : 2;
}

/**
 * Arrondit un montant locatif (unité majeure) au nombre de décimales de sa
 * devise. Les montants locatifs de ce lot sont des entiers stockés tels
 * quels (voir décision de portée) : pour XAF/XOF, arrondit à l'entier ; pour
 * les autres, au centième — jamais un troisième comportement implicite.
 */
export function roundToCurrencyPrecision(amount: number, currency: string): number {
  const decimals = decimalsForRentalCurrency(currency);
  const factor = 10 ** decimals;
  return Math.round(amount * factor) / factor;
}

/**
 * Formate un montant locatif (déjà en unité majeure — jamais une conversion
 * mineure/majeure ici) pour l'affichage, dans la bonne devise, avec un repli
 * si `Intl.NumberFormat` ne reconnaît pas le code devise ou la locale.
 */
export function formatRentalAmount(amount: number, currency: string, locale: string): string {
  const rounded = roundToCurrencyPrecision(amount, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimalsForRentalCurrency(currency),
      maximumFractionDigits: decimalsForRentalCurrency(currency),
    }).format(rounded);
  } catch {
    return `${rounded.toFixed(decimalsForRentalCurrency(currency))} ${currency}`;
  }
}

/**
 * Somme plusieurs montants de la MÊME devise (allocation/répartition d'un
 * paiement, par exemple). Refuse explicitement de sommer des devises
 * différentes plutôt que de produire un total trompeur — § mandat : « ne
 * jamais mélanger deux devises dans un total ».
 */
export function sumSameCurrency(amounts: { amount: number; currency: string }[]): number {
  if (amounts.length === 0) return 0;
  const currency = amounts[0].currency;
  for (const entry of amounts) {
    if (entry.currency !== currency) {
      throw new Error(`currency_mismatch: cannot sum ${entry.currency} with ${currency}`);
    }
  }
  return roundToCurrencyPrecision(
    amounts.reduce((total, entry) => total + entry.amount, 0),
    currency,
  );
}
