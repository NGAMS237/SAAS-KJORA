// Aperçu des échéances qu'un bail importé va produire, et correction de la date
// de début de bail avant l'import. Reproduit la boucle de comptage de la RPC
// `commit_data_import` (même règle : une échéance existe dès que son avis,
// 5 jours avant l'échéance, est passé).

import type { ImportBillingFrequency, NormalizedLeaseRow } from "./model.ts";

const FREQUENCY_MONTHS: Record<ImportBillingFrequency, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } as Record<ImportBillingFrequency, number>;

function utc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function countElapsedPeriods(startDate: string, frequency: ImportBillingFrequency, dueDay: number | null | undefined, today: Date = new Date()): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 0;
  const step = FREQUENCY_MONTHS[frequency] ?? 1;
  const [startY, startM] = startDate.split("-").map(Number);
  const startMs = utc(startDate);
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let count = 0;
  for (let index = 0; index < 240; index += 1) {
    const monthIndex = startM - 1 + index * step;
    const year = startY + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(dueDay ?? 5, lastDay);
    const dueMs = Math.max(Date.UTC(year, month, day), startMs);
    if (dueMs - 5 * 86400000 > todayMs) break;
    count += 1;
  }
  return count;
}

export type StartDateCheck = { elapsedPeriods: number; expectedXaf: number; debtExceeds: boolean };

export function checkLeaseStart(lease: NormalizedLeaseRow["lease"], startDate: string, today: Date = new Date()): StartDateCheck {
  const periodic = (lease.baseRentXaf ?? 0) + (lease.recurringChargesXaf ?? 0);
  const elapsedPeriods = countElapsedPeriods(startDate, lease.billingFrequency ?? "monthly", lease.dueDay, today);
  const expectedXaf = elapsedPeriods * periodic;
  const debt = lease.openingSituation.kind === "debt" ? lease.openingSituation.amountXaf : 0;
  return { elapsedPeriods, expectedXaf, debtExceeds: debt > expectedXaf };
}

export function applyStartDateOverrides<T extends { rowNumber: number; row: NormalizedLeaseRow }>(rows: T[], overrides: ReadonlyMap<number, string>): T[] {
  return rows.map((entry) => {
    const date = overrides.get(entry.rowNumber);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return entry;
    return { ...entry, row: { ...entry.row, lease: { ...entry.row.lease, startDate: date } } };
  });
}
