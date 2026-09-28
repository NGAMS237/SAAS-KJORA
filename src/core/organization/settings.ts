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

export const ORGANIZATION_TIMEZONES = [
  ["Africa/Douala", "Cameroun — Douala / Yaoundé"],
  ["Africa/Abidjan", "Côte d’Ivoire — Abidjan"],
  ["Africa/Dakar", "Sénégal — Dakar"],
  ["Africa/Lagos", "Nigeria — Lagos"],
  ["Africa/Kinshasa", "RDC — Kinshasa"],
  ["Africa/Nairobi", "Kenya — Nairobi"],
  ["Africa/Johannesburg", "Afrique du Sud — Johannesburg"],
  ["Europe/Paris", "France — Paris"],
  ["Europe/London", "Royaume-Uni — Londres"],
  ["America/Toronto", "Canada — Toronto"],
  ["America/New_York", "États-Unis — New York"],
] as const;

export function isSupportedOrganizationTimezone(value: unknown) {
  if (typeof value !== "string" || !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
