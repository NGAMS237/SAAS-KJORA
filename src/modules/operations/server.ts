import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ActivityEvent,
  AuditEntry,
  AuditFilters,
  DashboardPeriod,
  OperationalDashboard,
  OperationalHealth,
} from "@/modules/operations/model";

type DashboardRow = {
  period_from: string; period_to: string; finance_available: boolean; portfolio_available: boolean;
  expected_xaf: number | null; collected_xaf: number | null; credit_applied_xaf: number | null;
  remaining_xaf: number | null; overdue_xaf: number | null; overdue_count: number | null;
  overdue_tenant_count: number | null; upcoming_count: number | null; partial_count: number | null;
  active_tenant_count: number | null; unit_count: number | null; occupied_unit_count: number | null;
};

type ActivityRow = {
  event_id: string; event_type: string; aggregate_type: string; aggregate_id: string;
  actor_user_id: string | null; context_label: string; payload: Record<string, unknown>; created_at: string;
};

type AuditRow = {
  audit_id: string; action: string; actor_user_id: string; actor_email: string | null;
  target_email: string | null; details: Record<string, unknown>; created_at: string;
};

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export async function getOperationalDashboard(organizationId: string, period: DashboardPeriod): Promise<OperationalDashboard> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_operational_dashboard", {
    target_organization_id: organizationId,
    period_from: period.from,
    period_to: period.to,
  });
  if (result.error) throw result.error;
  const row = result.data as DashboardRow;
  return {
    periodFrom: row.period_from, periodTo: row.period_to,
    financeAvailable: Boolean(row.finance_available), portfolioAvailable: Boolean(row.portfolio_available),
    expectedXaf: numberOrNull(row.expected_xaf), collectedXaf: numberOrNull(row.collected_xaf),
    creditAppliedXaf: numberOrNull(row.credit_applied_xaf), remainingXaf: numberOrNull(row.remaining_xaf),
    overdueXaf: numberOrNull(row.overdue_xaf), overdueCount: numberOrNull(row.overdue_count),
    overdueTenantCount: numberOrNull(row.overdue_tenant_count), upcomingCount: numberOrNull(row.upcoming_count),
    partialCount: numberOrNull(row.partial_count), activeTenantCount: numberOrNull(row.active_tenant_count),
    unitCount: numberOrNull(row.unit_count), occupiedUnitCount: numberOrNull(row.occupied_unit_count),
  };
}

export async function getOrganizationActivity(
  organizationId: string,
  cursor: { createdAt: string | null; id: string | null } = { createdAt: null, id: null },
  limit = 25,
): Promise<ActivityEvent[]> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("list_organization_activity", {
    target_organization_id: organizationId,
    before_created_at: cursor.createdAt,
    before_event_id: cursor.id,
    result_limit: limit,
  });
  if (result.error) throw result.error;
  return ((result.data ?? []) as ActivityRow[]).map((row) => ({
    id: row.event_id, type: row.event_type, aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id, actorUserId: row.actor_user_id,
    contextLabel: row.context_label, payload: row.payload as Record<string, unknown>, createdAt: row.created_at,
  }));
}

export async function getOperationalAudit(organizationId: string, filters: AuditFilters, limit = 25): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("list_operational_audit", {
    target_organization_id: organizationId,
    before_created_at: filters.cursorAt,
    before_audit_id: filters.cursorId,
    action_filter: filters.action,
    actor_filter: filters.actor,
    created_from: filters.from,
    created_to: filters.to,
    result_limit: limit,
  });
  if (result.error) throw result.error;
  return ((result.data ?? []) as AuditRow[]).map((row) => ({
    id: row.audit_id, action: row.action, actorUserId: row.actor_user_id,
    actorEmail: row.actor_email, targetEmail: row.target_email,
    details: row.details as Record<string, unknown>, createdAt: row.created_at,
  }));
}

export async function getOperationalHealth(organizationId: string): Promise<OperationalHealth> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_operational_health", { target_organization_id: organizationId });
  if (result.error) throw result.error;
  const row = result.data as {
    daily_job: { status: string; started_at: string | null; finished_at: string | null } | null;
    document_backlog: number; document_failures: number; delivery_counts: Record<string, number>;
    communication_settings: Record<string, boolean | string | null>;
  };
  return {
    dailyJob: row.daily_job ? { status: row.daily_job.status, startedAt: row.daily_job.started_at, finishedAt: row.daily_job.finished_at } : null,
    documentBacklog: Number(row.document_backlog ?? 0), documentFailures: Number(row.document_failures ?? 0),
    deliveryCounts: row.delivery_counts ?? {}, communicationSettings: row.communication_settings ?? {},
  };
}
