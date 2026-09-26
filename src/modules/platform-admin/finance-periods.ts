// =============================================================================
// FINANCE-ADMIN-01 — Filtre de période (module PUR)
// =============================================================================
// Volontairement séparé de server.ts (qui importe "server-only") : ce module
// est importé à la fois par le serveur (page.tsx) et par un composant client
// ("use client", views.tsx) pour peupler le <select> du filtre de période.
// Un composant client ne peut jamais importer, même pour une seule constante,
// un module qui dépend de "server-only" — voir pagination.ts / monitoring.ts
// pour la même séparation, déjà établie par ADMIN-01.
// =============================================================================

/** Liste fermée, doit correspondre EXACTEMENT à private.finance_period_bounds. */
export const FINANCE_PERIOD_FILTERS = [
  "last_30_days",
  "last_90_days",
  "current_year",
  "all_time",
] as const;

export type FinancePeriodFilter = (typeof FINANCE_PERIOD_FILTERS)[number];

export function isFinancePeriodFilter(value: unknown): value is FinancePeriodFilter {
  return typeof value === "string" && (FINANCE_PERIOD_FILTERS as readonly string[]).includes(value);
}
