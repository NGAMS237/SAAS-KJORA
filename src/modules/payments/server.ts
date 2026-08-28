import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PaymentAllocationSummary,
  PaymentDetail,
  PaymentDueOption,
  PaymentLeaseOption,
  PaymentMethod,
  PaymentStatus,
  PaymentSummary,
} from "@/modules/payments/model";

type PaymentRow = {
  id: string; reference: string; tenant_id: string; lease_id: string;
  amount_xaf: number | string; payment_date: string; method: PaymentMethod;
  external_reference: string | null; note: string | null; status: PaymentStatus;
  allocation_mode: "automatic" | "manual"; balance_before_xaf: number | string;
  balance_after_xaf: number | string; created_by: string; created_at: string;
  confirmed_at: string; reversed_by: string | null; reversed_at: string | null;
  reversal_reason: string | null;
};

type AllocationRow = {
  id: string; payment_id: string; due_id: string; amount_xaf: number | string;
  rent_amount_xaf: number | string; recurring_charges_amount_xaf: number | string;
  deposit_amount_xaf: number | string;
};

type DueRow = {
  id: string; lease_id: string; kind: PaymentDueOption["kind"] | "adjustment"; reference: string;
  period_start: string; period_end: string; due_date: string; rent_amount_xaf: number | string;
  recurring_charges_amount_xaf: number | string; deposit_amount_xaf: number | string;
  remaining_amount_xaf: number | string; derived_status: string;
};

const PAYMENT_COLUMNS = "id, reference, tenant_id, lease_id, amount_xaf, payment_date, method, external_reference, note, status, allocation_mode, balance_before_xaf, balance_after_xaf, created_by, created_at, confirmed_at, reversed_by, reversed_at, reversal_reason";
const ALLOCATION_COLUMNS = "id, payment_id, due_id, amount_xaf, rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf";
const DUE_COLUMNS = "id, lease_id, kind, reference, period_start, period_end, due_date, rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, remaining_amount_xaf, derived_status";

type ContextMaps = {
  tenants: Map<string, string>;
  leases: Map<string, { tenantId: string; propertyId: string; unitId: string; status: "active" | "ended" }>;
  properties: Map<string, string>;
  units: Map<string, string>;
};

async function contextMaps(organizationId: string): Promise<ContextMaps> {
  const supabase = await createSupabaseServerClient();
  const [tenants, leases, properties, units] = await Promise.all([
    supabase.from("tenants").select("id, full_name").eq("organization_id", organizationId).limit(1000),
    supabase.from("leases").select("id, tenant_id, property_id, unit_id, status").eq("organization_id", organizationId).in("status", ["active", "ended"]).limit(1000),
    supabase.from("properties").select("id, name").eq("organization_id", organizationId).limit(1000),
    supabase.from("units").select("id, label").eq("organization_id", organizationId).limit(1000),
  ]);
  for (const result of [tenants, leases, properties, units]) if (result.error) throw result.error;
  return {
    tenants: new Map((tenants.data ?? []).map((row) => [row.id, row.full_name])),
    leases: new Map((leases.data ?? []).map((row) => [row.id, {
      tenantId: row.tenant_id, propertyId: row.property_id, unitId: row.unit_id,
      status: row.status as "active" | "ended",
    }])),
    properties: new Map((properties.data ?? []).map((row) => [row.id, row.name])),
    units: new Map((units.data ?? []).map((row) => [row.id, row.label])),
  };
}

function dueOption(row: DueRow): PaymentDueOption {
  return {
    id: row.id, kind: row.kind as PaymentDueOption["kind"], reference: row.reference,
    periodStart: row.period_start, periodEnd: row.period_end, dueDate: row.due_date,
    rentXaf: Number(row.rent_amount_xaf), recurringChargesXaf: Number(row.recurring_charges_amount_xaf),
    depositXaf: Number(row.deposit_amount_xaf), remainingXaf: Number(row.remaining_amount_xaf),
    status: row.derived_status,
  };
}

function allocation(row: AllocationRow, due: DueRow | undefined): PaymentAllocationSummary {
  return {
    id: row.id, dueId: row.due_id, dueReference: due?.reference ?? "—",
    dueKind: due?.kind === "adjustment" || !due ? "periodic" : due.kind,
    periodStart: due?.period_start ?? "", periodEnd: due?.period_end ?? "",
    amountXaf: Number(row.amount_xaf), rentXaf: Number(row.rent_amount_xaf),
    recurringChargesXaf: Number(row.recurring_charges_amount_xaf), depositXaf: Number(row.deposit_amount_xaf),
  };
}

function paymentSummary(
  row: PaymentRow,
  contexts: ContextMaps,
  allocatedXaf: number,
): PaymentSummary {
  const lease = contexts.leases.get(row.lease_id);
  return {
    id: row.id, reference: row.reference, tenantId: row.tenant_id, leaseId: row.lease_id,
    tenantName: contexts.tenants.get(row.tenant_id) ?? "—",
    propertyName: lease ? contexts.properties.get(lease.propertyId) ?? "—" : "—",
    unitLabel: lease ? contexts.units.get(lease.unitId) ?? "—" : "—",
    amountXaf: Number(row.amount_xaf), paymentDate: row.payment_date, method: row.method,
    externalReference: row.external_reference, status: row.status,
    allocationMode: row.allocation_mode, allocatedXaf,
    creditCreatedXaf: Math.max(Number(row.amount_xaf) - allocatedXaf, 0),
    createdBy: row.created_by, createdAt: row.created_at, reversedAt: row.reversed_at,
  };
}

async function allocationRows(organizationId: string, paymentIds: string[]) {
  if (!paymentIds.length) return [] as AllocationRow[];
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("payment_allocations").select(ALLOCATION_COLUMNS)
    .eq("organization_id", organizationId).in("payment_id", paymentIds).order("created_at");
  if (result.error) throw result.error;
  return (result.data ?? []) as AllocationRow[];
}

export async function getPayments(
  organizationId: string,
  filter: { tenantId?: string; leaseId?: string } = {},
): Promise<PaymentSummary[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("payments").select(PAYMENT_COLUMNS).eq("organization_id", organizationId)
    .order("payment_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (filter.tenantId) query = query.eq("tenant_id", filter.tenantId);
  if (filter.leaseId) query = query.eq("lease_id", filter.leaseId);
  const [result, contexts] = await Promise.all([query, contextMaps(organizationId)]);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as PaymentRow[];
  const allocations = await allocationRows(organizationId, rows.map((row) => row.id));
  const totals = new Map<string, number>();
  for (const row of allocations) totals.set(row.payment_id, (totals.get(row.payment_id) ?? 0) + Number(row.amount_xaf));
  return rows.map((row) => paymentSummary(row, contexts, totals.get(row.id) ?? 0));
}

export async function getPaymentDetail(organizationId: string, paymentId: string): Promise<PaymentDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [result, contexts] = await Promise.all([
    supabase.from("payments").select(PAYMENT_COLUMNS).eq("organization_id", organizationId).eq("id", paymentId).maybeSingle(),
    contextMaps(organizationId),
  ]);
  if (result.error) throw result.error;
  if (!result.data) return null;
  const row = result.data as PaymentRow;
  const allocations = await allocationRows(organizationId, [paymentId]);
  const dueIds = allocations.map((item) => item.due_id);
  let dues: DueRow[] = [];
  if (dueIds.length) {
    const dueResult = await supabase.from("dues_with_status").select(DUE_COLUMNS)
      .eq("organization_id", organizationId).in("id", dueIds);
    if (dueResult.error) throw dueResult.error;
    dues = (dueResult.data ?? []) as DueRow[];
  }
  const dueMap = new Map(dues.map((item) => [item.id, item]));
  const allocationSummaries = allocations.map((item) => allocation(item, dueMap.get(item.due_id)));
  const summary = paymentSummary(row, contexts, allocationSummaries.reduce((sum, item) => sum + item.amountXaf, 0));
  return {
    ...summary, note: row.note, balanceBeforeXaf: Number(row.balance_before_xaf),
    balanceAfterXaf: Number(row.balance_after_xaf), confirmedAt: row.confirmed_at,
    reversedBy: row.reversed_by, reversalReason: row.reversal_reason,
    allocations: allocationSummaries,
  };
}

export async function getPaymentLeaseOptions(organizationId: string): Promise<PaymentLeaseOption[]> {
  const supabase = await createSupabaseServerClient();
  const contexts = await contextMaps(organizationId);
  const [duesResult, ledgerResult] = await Promise.all([
    supabase.from("dues_with_status").select(DUE_COLUMNS).eq("organization_id", organizationId)
      .neq("kind", "adjustment").gt("remaining_amount_xaf", 0).order("due_date").order("period_start"),
    supabase.from("ledger_entries").select("lease_id, debit_xaf, credit_xaf")
      .eq("organization_id", organizationId),
  ]);
  if (duesResult.error) throw duesResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  const duesByLease = new Map<string, PaymentDueOption[]>();
  for (const row of (duesResult.data ?? []) as DueRow[]) {
    const list = duesByLease.get(row.lease_id) ?? [];
    list.push(dueOption(row));
    duesByLease.set(row.lease_id, list);
  }
  const balanceByLease = new Map<string, number>();
  for (const row of ledgerResult.data ?? []) {
    balanceByLease.set(row.lease_id, (balanceByLease.get(row.lease_id) ?? 0)
      + Number(row.credit_xaf) - Number(row.debit_xaf));
  }
  const today = new Date().toISOString().slice(0, 10);
  return [...contexts.leases.entries()].map(([leaseId, lease]) => {
    const dues = duesByLease.get(leaseId) ?? [];
    const amountDueXaf = dues
      .filter((due) => due.dueDate <= today)
      .reduce((sum, due) => sum + due.remainingXaf, 0);
    const leaseBalanceXaf = balanceByLease.get(leaseId) ?? 0;
    return {
      leaseId, tenantId: lease.tenantId, tenantName: contexts.tenants.get(lease.tenantId) ?? "—",
      propertyName: contexts.properties.get(lease.propertyId) ?? "—",
      unitLabel: contexts.units.get(lease.unitId) ?? "—", status: lease.status,
      amountDueXaf, availableCreditXaf: Math.max(leaseBalanceXaf, 0), dues,
    };
  }).sort((left, right) => Number(right.status === "active") - Number(left.status === "active")
    || left.tenantName.localeCompare(right.tenantName));
}
