import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DueStatus,
  DueSummary,
  LeaseFinancialDetail,
  LedgerEntrySummary,
  TenantFinancialDetail,
  TenantFinancialPosition,
} from "@/modules/finance/model";

type DueRow = {
  id: string; lease_id: string; kind: DueSummary["kind"]; reference: string;
  period_start: string; period_end: string; due_date: string; notice_date: string; generated_at: string;
  rent_amount_xaf: number | string; recurring_charges_amount_xaf: number | string;
  deposit_amount_xaf: number | string; adjustment_amount_xaf: number | string;
  adjustment_direction: DueSummary["adjustmentDirection"];
  expected_amount_xaf: number | string; net_expected_amount_xaf: number | string;
  covered_by_opening_credit_xaf: number | string; remaining_amount_xaf: number | string;
  covered_by_payment_credit_xaf: number | string; payment_allocated_xaf: number | string;
  rent_paid_xaf: number | string; recurring_charges_paid_xaf: number | string;
  deposit_paid_xaf: number | string;
  derived_status: DueStatus; next_reminder_date: string | null;
};

type LedgerRow = {
  id: string; lease_id: string; entry_type: LedgerEntrySummary["type"]; reference: string;
  payment_id: string | null;
  description_code: string; occurred_on: string; period_start: string | null; period_end: string | null;
  debit_xaf: number | string; credit_xaf: number | string; running_balance_xaf: number | string;
};

const DUE_COLUMNS = "id, lease_id, kind, reference, period_start, period_end, due_date, notice_date, generated_at, rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, adjustment_amount_xaf, adjustment_direction, expected_amount_xaf, net_expected_amount_xaf, covered_by_opening_credit_xaf, covered_by_payment_credit_xaf, payment_allocated_xaf, rent_paid_xaf, recurring_charges_paid_xaf, deposit_paid_xaf, remaining_amount_xaf, derived_status, next_reminder_date";
const LEDGER_COLUMNS = "id, lease_id, payment_id, entry_type, reference, description_code, occurred_on, period_start, period_end, debit_xaf, credit_xaf, running_balance_xaf";
const POSITION_COLUMNS = "amount_due_xaf, residual_opening_credit_xaf, residual_payment_credit_xaf, available_credit_xaf, total_received_xaf, ledger_balance_xaf, covered_periods, last_covered_period_end, next_uncovered_due_date, next_due_date, last_ledger_date";

type PositionRow = {
  amount_due_xaf: number | string; residual_opening_credit_xaf: number | string; covered_periods: number | string;
  residual_payment_credit_xaf: number | string; available_credit_xaf: number | string;
  total_received_xaf: number | string; ledger_balance_xaf: number | string;
  last_covered_period_end: string | null; next_uncovered_due_date: string | null; next_due_date: string | null;
  last_ledger_date: string | null;
};

function due(row: DueRow): DueSummary {
  return {
    id: row.id, leaseId: row.lease_id, kind: row.kind, reference: row.reference,
    periodStart: row.period_start, periodEnd: row.period_end, dueDate: row.due_date,
    noticeDate: row.notice_date, generatedAt: row.generated_at,
    rentXaf: Number(row.rent_amount_xaf), recurringChargesXaf: Number(row.recurring_charges_amount_xaf),
    depositXaf: Number(row.deposit_amount_xaf), adjustmentXaf: Number(row.adjustment_amount_xaf),
    adjustmentDirection: row.adjustment_direction, expectedXaf: Number(row.expected_amount_xaf),
    netExpectedXaf: Number(row.net_expected_amount_xaf), coveredXaf: Number(row.covered_by_opening_credit_xaf),
    coveredByPaymentCreditXaf: Number(row.covered_by_payment_credit_xaf),
    paymentAllocatedXaf: Number(row.payment_allocated_xaf), rentPaidXaf: Number(row.rent_paid_xaf),
    recurringChargesPaidXaf: Number(row.recurring_charges_paid_xaf), depositPaidXaf: Number(row.deposit_paid_xaf),
    remainingXaf: Number(row.remaining_amount_xaf), status: row.derived_status,
    nextReminderDate: row.next_reminder_date,
  };
}

function ledger(row: LedgerRow): LedgerEntrySummary {
  return {
    id: row.id, leaseId: row.lease_id, paymentId: row.payment_id, type: row.entry_type, reference: row.reference,
    descriptionCode: row.description_code, occurredOn: row.occurred_on,
    periodStart: row.period_start, periodEnd: row.period_end,
    debitXaf: Number(row.debit_xaf), creditXaf: Number(row.credit_xaf),
    runningBalanceXaf: Number(row.running_balance_xaf),
  };
}

function position(row: PositionRow | null): TenantFinancialPosition {
  return {
    amountDueXaf: Number(row?.amount_due_xaf ?? 0),
    residualOpeningCreditXaf: Number(row?.residual_opening_credit_xaf ?? 0),
    residualPaymentCreditXaf: Number(row?.residual_payment_credit_xaf ?? 0),
    availableCreditXaf: Number(row?.available_credit_xaf ?? 0),
    totalReceivedXaf: Number(row?.total_received_xaf ?? 0),
    ledgerBalanceXaf: Number(row?.ledger_balance_xaf ?? 0),
    coveredPeriods: Number(row?.covered_periods ?? 0),
    lastCoveredPeriodEnd: row?.last_covered_period_end ?? null,
    nextUncoveredDueDate: row?.next_uncovered_due_date ?? null,
    nextDueDate: row?.next_due_date ?? null,
    lastLedgerDate: row?.last_ledger_date ?? null,
  };
}

export async function getLeaseFinancialDetail(organizationId: string, leaseId: string): Promise<LeaseFinancialDetail> {
  const supabase = await createSupabaseServerClient();
  const [duesResult, ledgerResult] = await Promise.all([
    supabase.from("dues_with_status").select(DUE_COLUMNS).eq("organization_id", organizationId).eq("lease_id", leaseId).order("due_date").order("period_start"),
    supabase.from("ledger_statement").select(LEDGER_COLUMNS).eq("organization_id", organizationId).eq("lease_id", leaseId).order("occurred_on").order("sort_order"),
  ]);
  if (duesResult.error) throw duesResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  return {
    dues: ((duesResult.data ?? []) as DueRow[]).map(due),
    ledger: ((ledgerResult.data ?? []) as LedgerRow[]).map(ledger),
  };
}

export async function getTenantFinancialPosition(organizationId: string, tenantId: string): Promise<TenantFinancialPosition> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("tenant_financial_positions").select(POSITION_COLUMNS).eq("organization_id", organizationId).eq("tenant_id", tenantId).maybeSingle();
  if (result.error) throw result.error;
  return position(result.data as PositionRow | null);
}

export async function getTenantFinancialDetail(organizationId: string, tenantId: string): Promise<TenantFinancialDetail> {
  const supabase = await createSupabaseServerClient();
  const [positionResult, duesResult, ledgerResult] = await Promise.all([
    supabase.from("tenant_financial_positions").select(POSITION_COLUMNS).eq("organization_id", organizationId).eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("dues_with_status").select(DUE_COLUMNS).eq("organization_id", organizationId).eq("tenant_id", tenantId).order("due_date").order("period_start"),
    supabase.from("ledger_statement").select(LEDGER_COLUMNS).eq("organization_id", organizationId).eq("tenant_id", tenantId).order("occurred_on").order("sort_order"),
  ]);
  if (positionResult.error) throw positionResult.error;
  if (duesResult.error) throw duesResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  return {
    ...position(positionResult.data as PositionRow | null),
    dues: ((duesResult.data ?? []) as DueRow[]).map(due),
    ledger: ((ledgerResult.data ?? []) as LedgerRow[]).map(ledger),
  };
}

// Solde dû par locataire, pour signaler les retards directement dans la liste.
export async function listTenantAmountsDue(organizationId: string): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("tenant_financial_positions").select("tenant_id, amount_due_xaf").eq("organization_id", organizationId).limit(2000);
  if (result.error) throw result.error;
  const out: Record<string, number> = {};
  for (const row of (result.data ?? []) as Array<{ tenant_id: string; amount_due_xaf: number | string }>) out[row.tenant_id] = Number(row.amount_due_xaf);
  return out;
}
