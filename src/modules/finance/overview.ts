// Tableau « Échéances » — logique PURE (filtres, regroupement, totaux).
// Aucun montant n'est recalculé : les valeurs viennent de la projection serveur
// (dues_with_status), ce module ne fait que les trier et les additionner.

import type { DueStatus } from "./model.ts";

export type DueOverviewRow = {
  dueId: string; leaseId: string; tenantId: string; tenantName: string;
  unitLabel: string; propertyName: string; reference: string;
  kind: "periodic" | "initial_prorata" | "deposit" | "adjustment";
  dueDate: string; periodStart: string; periodEnd: string; noticeDate: string;
  totalXaf: number; paidXaf: number; remainingXaf: number; status: DueStatus;
  phone: string | null; email: string | null;
};

export type DueFilter = "all" | "overdue" | "due" | "upcoming" | "settled";
export const DUE_FILTERS: DueFilter[] = ["all", "overdue", "due", "upcoming", "settled"];

export function isSettled(status: DueStatus) {
  return status === "paid" || status === "covered" || status === "cancelled";
}

export function matchesFilter(row: Pick<DueOverviewRow, "status">, filter: DueFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "overdue": return row.status === "overdue";
    case "due": return row.status === "due" || row.status === "partially_paid";
    case "upcoming": return row.status === "upcoming";
    case "settled": return isSettled(row.status);
  }
}

export function countByFilter(rows: Array<Pick<DueOverviewRow, "status">>): Record<DueFilter, number> {
  const out: Record<DueFilter, number> = { all: 0, overdue: 0, due: 0, upcoming: 0, settled: 0 };
  for (const row of rows) for (const filter of DUE_FILTERS) if (matchesFilter(row, filter)) out[filter] += 1;
  return out;
}

export function monthKey(dueDate: string): string {
  return dueDate.slice(0, 7);
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1] ?? key;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function daysLate(row: Pick<DueOverviewRow, "dueDate" | "status" | "remainingXaf">, today: string): number {
  if (row.remainingXaf <= 0 || isSettled(row.status) || row.dueDate >= today) return 0;
  const [fy, fm, fd] = row.dueDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000));
}

export function matchesSearch(row: Pick<DueOverviewRow, "tenantName" | "unitLabel" | "propertyName" | "reference">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.tenantName, row.unitLabel, row.propertyName, row.reference].some((value) => value.toLowerCase().includes(needle));
}

export type OverviewTotals = { expectedXaf: number; receivedXaf: number; remainingXaf: number; overdueXaf: number; overdueCount: number };

export function summarize(rows: DueOverviewRow[]): OverviewTotals {
  const totals: OverviewTotals = { expectedXaf: 0, receivedXaf: 0, remainingXaf: 0, overdueXaf: 0, overdueCount: 0 };
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    totals.expectedXaf += row.totalXaf;
    totals.receivedXaf += row.paidXaf;
    totals.remainingXaf += row.remainingXaf;
    if (row.status === "overdue") { totals.overdueXaf += row.remainingXaf; totals.overdueCount += 1; }
  }
  return totals;
}

export function groupByMonth(rows: DueOverviewRow[]): Array<{ key: string; label: string; rows: DueOverviewRow[] }> {
  const groups = new Map<string, DueOverviewRow[]>();
  for (const row of rows) {
    const key = monthKey(row.dueDate);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, items]) => ({ key, label: monthLabel(key), rows: items }));
}

// Ordre dans un mois : retards d'abord (les plus anciens en tête), puis à régler, puis le reste.
export function sortRows(rows: DueOverviewRow[]): DueOverviewRow[] {
  const rank = (row: DueOverviewRow) => row.status === "overdue" ? 0 : row.status === "partially_paid" ? 1 : row.status === "due" ? 2 : row.status === "upcoming" ? 3 : 4;
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate) || a.tenantName.localeCompare(b.tenantName));
}
