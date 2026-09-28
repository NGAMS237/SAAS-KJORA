// AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A : le catalogue de devises de
// location vit désormais dans core/currency/metadata.ts (source unique,
// partagée avec le formatage/l'arrondi). Ce module ré-exporte pour ne pas
// casser les imports existants, mais n'a plus sa propre liste : la garder ici
// ET là-bas aurait été exactement le genre de duplication que le mandat
// demande d'éviter. Les 57 colonnes `*_xaf` continuent de stocker un montant
// en unité majeure entière quelle que soit la devise choisie (voir le
// commentaire de portée en tête de core/currency/metadata.ts).
//
// Import RELATIF (pas d'alias `@/`) : ce module est un module pur, chargé
// directement par `node --test` sans bundler dans
// tests/organization-settings.test.ts — un alias `@/` y échoue avec
// ERR_MODULE_NOT_FOUND (même convention que capability-catalog-cache.ts).
export { RENTAL_CURRENCIES as ORGANIZATION_CURRENCIES, isRentalCurrency as isOrganizationCurrency } from "../currency/metadata.ts";
export type { RentalCurrency as OrganizationCurrency } from "../currency/metadata.ts";

import { SUPPORTED_COUNTRIES } from "../currency/metadata.ts";

const AFRICAN_TIMEZONES = SUPPORTED_COUNTRIES.map(
  ({ countryCode, label, timezone }) => [timezone, { fr: `${label.fr} (${countryCode})`, en: `${label.en} (${countryCode})` }] as const,
);

const OTHER_TIMEZONES = [
  ["Europe/Paris", { fr: "France — Paris", en: "France — Paris" }],
  ["Europe/London", { fr: "Royaume-Uni — Londres", en: "United Kingdom — London" }],
  ["America/Toronto", { fr: "Canada — Toronto", en: "Canada — Toronto" }],
  ["America/New_York", { fr: "États-Unis — New York", en: "United States — New York" }],
] as const;

// Les fuseaux des pays disponibles viennent du même catalogue que l'onboarding.
// Une déduplication évite deux options si plusieurs pays partagent un fuseau.
export const ORGANIZATION_TIMEZONES = [
  ...new Map([...AFRICAN_TIMEZONES, ...OTHER_TIMEZONES].map(([id, label]) => [id, [id, label] as const])).values(),
];

export function isSupportedOrganizationTimezone(value: unknown) {
  if (typeof value !== "string" || !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
