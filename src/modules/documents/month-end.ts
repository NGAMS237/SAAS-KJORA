const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type MonthEndPreview = {
  currency: string;
  leasesSelected: number;
  duesSelected: number;
  documentsPrepared: number;
  documentsMissing: number;
  awaitingApproval: number;
  deferred: number;
  approved: number;
  queued: number;
  sent: number;
};

export function parseMonthEndSelection(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return { selectedMonth: "", targetMonth: null, invalid: false } as const;
  if (!MONTH_PATTERN.test(candidate)) return { selectedMonth: "", targetMonth: null, invalid: true } as const;
  return { selectedMonth: candidate, targetMonth: `${candidate}-01`, invalid: false } as const;
}
