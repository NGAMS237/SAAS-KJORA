// The financial model and persisted amount columns are XAF-first for the MVP.
// Keep this catalog explicit so more currencies can be enabled later without
// pretending the current ledger already supports them.
export const ORGANIZATION_CURRENCIES = ["XAF"] as const;
export type OrganizationCurrency = (typeof ORGANIZATION_CURRENCIES)[number];

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

export function isOrganizationCurrency(value: unknown): value is OrganizationCurrency {
  return typeof value === "string" && (ORGANIZATION_CURRENCIES as readonly string[]).includes(value);
}

export function isSupportedOrganizationTimezone(value: unknown) {
  if (typeof value !== "string" || !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
