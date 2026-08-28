import type { BillingFrequency, ProrationMode } from "@/modules/tenancy/model";

export const DUE_STATUSES = ["upcoming", "due", "overdue", "covered", "partially_paid", "paid", "cancelled", "adjusted"] as const;
export const DUE_LINE_TYPES = ["rent", "recurring_charge", "initial_prorata", "deposit", "adjustment"] as const;

export type DueStatus = (typeof DUE_STATUSES)[number];
export type DueLineType = (typeof DUE_LINE_TYPES)[number];

export type DueSummary = {
  id: string;
  leaseId: string;
  kind: "periodic" | "initial_prorata" | "deposit" | "adjustment";
  reference: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  noticeDate: string;
  generatedAt: string;
  rentXaf: number;
  recurringChargesXaf: number;
  depositXaf: number;
  adjustmentXaf: number;
  adjustmentDirection: "debit" | "credit" | null;
  expectedXaf: number;
  netExpectedXaf: number;
  coveredXaf: number;
  coveredByPaymentCreditXaf: number;
  paymentAllocatedXaf: number;
  rentPaidXaf: number;
  recurringChargesPaidXaf: number;
  depositPaidXaf: number;
  remainingXaf: number;
  status: DueStatus;
  nextReminderDate: string | null;
};

export type LedgerEntrySummary = {
  id: string;
  leaseId: string;
  type: DueLineType | "opening_credit" | "payment" | "payment_reversal";
  paymentId: string | null;
  reference: string;
  descriptionCode: string;
  occurredOn: string;
  periodStart: string | null;
  periodEnd: string | null;
  debitXaf: number;
  creditXaf: number;
  runningBalanceXaf: number;
};

export type TenantFinancialPosition = {
  amountDueXaf: number;
  residualOpeningCreditXaf: number;
  residualPaymentCreditXaf: number;
  availableCreditXaf: number;
  totalReceivedXaf: number;
  ledgerBalanceXaf: number;
  coveredPeriods: number;
  lastCoveredPeriodEnd: string | null;
  nextUncoveredDueDate: string | null;
  nextDueDate: string | null;
  lastLedgerDate: string | null;
};

export type LeaseFinancialDetail = { dues: DueSummary[]; ledger: LedgerEntrySummary[] };
export type TenantFinancialDetail = TenantFinancialPosition & LeaseFinancialDetail;

export type FinancialTerms = {
  leaseStart: string;
  effectiveEnd: string | null;
  billingFrequency: BillingFrequency;
  baseRentXaf: number;
  recurringChargesXaf: number;
  dueDay: number;
  generateDaysBefore: number;
  entryProrationMode: ProrationMode;
  exitProrationMode: ProrationMode;
};

export type DuePlan = {
  periodStart: string;
  periodEnd: string;
  scheduledPeriodStart: string;
  scheduledPeriodEnd: string;
  dueDate: string;
  noticeDate: string;
  rentXaf: number;
  chargesXaf: number;
  totalXaf: number;
  isEntryProrata: boolean;
  isExitProrata: boolean;
  occupiedDays: number;
  daysInPeriod: number;
};

export type DueForPosition = {
  id: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountXaf: number;
  kind?: "periodic" | "deposit" | "adjustment";
  cancelled?: boolean;
};

export type PositionedDue = DueForPosition & {
  coveredXaf: number;
  remainingXaf: number;
  status: DueStatus;
};

const DAY_MS = 86_400_000;

function date(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  return iso(new Date(date(value).getTime() + days * DAY_MS));
}

function daysBetweenInclusive(start: string, end: string) {
  return Math.floor((date(end).getTime() - date(start).getTime()) / DAY_MS) + 1;
}

function firstDay(value: string) {
  const parsed = date(value);
  return iso(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)));
}

function addMonths(value: string, months: number) {
  const parsed = date(value);
  return iso(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + months, 1)));
}

function periodMonths(frequency: BillingFrequency) {
  return { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[frequency];
}

function endOfPeriod(periodStart: string, months: number) {
  return addDays(addMonths(periodStart, months), -1);
}

export function dueDateForPeriod(periodStart: string, dueDay: number) {
  const parsed = date(periodStart);
  const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), Math.min(Math.max(dueDay, 1), lastDay))));
}

export function buildDueSchedule(terms: FinancialTerms, throughDate: string, limit = 240): DuePlan[] {
  const months = periodMonths(terms.billingFrequency);
  const anchor = firstDay(terms.leaseStart);
  const end = terms.effectiveEnd;
  const result: DuePlan[] = [];

  for (let index = 0; index < limit; index += 1) {
    const scheduledPeriodStart = addMonths(anchor, index * months);
    const scheduledPeriodEnd = endOfPeriod(scheduledPeriodStart, months);
    if (end && scheduledPeriodStart > end) break;

    const periodStart = scheduledPeriodStart < terms.leaseStart ? terms.leaseStart : scheduledPeriodStart;
    const periodEnd = end && end < scheduledPeriodEnd ? end : scheduledPeriodEnd;
    const isEntryProrata = periodStart > scheduledPeriodStart && terms.entryProrationMode === "calendar_days";
    const isExitProrata = periodEnd < scheduledPeriodEnd && terms.exitProrationMode === "calendar_days";
    const daysInPeriod = daysBetweenInclusive(scheduledPeriodStart, scheduledPeriodEnd);
    const occupiedDays = daysBetweenInclusive(periodStart, periodEnd);
    const ratio = isEntryProrata || isExitProrata ? occupiedDays / daysInPeriod : 1;
    let dueDate = dueDateForPeriod(scheduledPeriodStart, terms.dueDay);
    if (dueDate < terms.leaseStart) dueDate = terms.leaseStart;
    const noticeDate = addDays(dueDate, -terms.generateDaysBefore);
    if (noticeDate > throughDate) break;

    const rentXaf = Math.round(terms.baseRentXaf * ratio);
    const chargesXaf = Math.round(terms.recurringChargesXaf * ratio);
    result.push({
      periodStart,
      periodEnd,
      scheduledPeriodStart,
      scheduledPeriodEnd,
      dueDate,
      noticeDate,
      rentXaf,
      chargesXaf,
      totalXaf: rentXaf + chargesXaf,
      isEntryProrata,
      isExitProrata,
      occupiedDays,
      daysInPeriod,
    });
  }

  return result;
}

export function deriveLedgerPosition(dues: readonly DueForPosition[], openingCreditXaf: number, asOf: string) {
  let availableCredit = Math.max(0, openingCreditXaf);
  const positioned: PositionedDue[] = [...dues]
    .sort((left, right) => {
      const priority = (item: DueForPosition) => item.kind === "deposit" ? 2 : item.kind === "adjustment" ? 3 : 1;
      return left.dueDate.localeCompare(right.dueDate)
        || priority(left) - priority(right)
        || left.periodStart.localeCompare(right.periodStart)
        || left.id.localeCompare(right.id);
    })
    .map((due) => {
      if (due.cancelled) return { ...due, coveredXaf: 0, remainingXaf: 0, status: "cancelled" as const };
      const coveredXaf = Math.min(due.amountXaf, availableCredit);
      availableCredit -= coveredXaf;
      const remainingXaf = due.amountXaf - coveredXaf;
      const status: DueStatus = remainingXaf === 0
        ? "covered"
        : due.dueDate > asOf
          ? "upcoming"
          : due.dueDate === asOf
            ? "due"
            : "overdue";
      return { ...due, coveredXaf, remainingXaf, status };
    });

  const periodic = positioned.filter((due) => (due.kind ?? "periodic") === "periodic");
  const lastCovered = periodic.filter((due) => due.status === "covered").at(-1) ?? null;
  const nextUncovered = periodic.find((due) => due.remainingXaf > 0) ?? null;
  const totalDebitXaf = positioned.reduce((sum, due) => sum + (due.cancelled ? 0 : due.amountXaf), 0);
  const balanceXaf = openingCreditXaf - totalDebitXaf;

  return {
    dues: positioned,
    openingCreditXaf,
    totalDebitXaf,
    balanceXaf,
    creditXaf: Math.max(balanceXaf, 0),
    amountDueXaf: Math.max(-balanceXaf, 0),
    coveredPeriods: periodic.filter((due) => due.status === "covered").length,
    lastCoveredPeriodEnd: lastCovered?.periodEnd ?? null,
    nextUncoveredDueDate: nextUncovered?.dueDate ?? null,
  };
}

export function financialBalanceLabel(balanceXaf: number) {
  if (balanceXaf > 0) return { state: "credit" as const, amountXaf: balanceXaf };
  if (balanceXaf < 0) return { state: "due" as const, amountXaf: Math.abs(balanceXaf) };
  return { state: "current" as const, amountXaf: 0 };
}
