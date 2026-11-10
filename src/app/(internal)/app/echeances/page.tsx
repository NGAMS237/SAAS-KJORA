import { getActiveAuthorization } from "@/core/authorization/server";
import { listDuesForOverview } from "@/modules/finance/server";
import { DuesOverviewView } from "@/modules/finance/dues-overview-view";
import { dueBreakdown } from "@/modules/finance/model";
import type { DueOverviewRow } from "@/modules/finance/overview";
import { isUuid } from "@/modules/notifications/model";
import { listLeases, listTenants } from "@/modules/tenancy/server";
import { MissingTenancyResource } from "@/modules/tenancy/views";

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" && value ? value : null;
}

export default async function DuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [authorization, query] = await Promise.all([getActiveAuthorization(), searchParams]);
  if (!authorization?.capabilities.includes("due.view")) return <MissingTenancyResource leases />;
  const [dues, leases, tenants] = await Promise.all([
    listDuesForOverview(authorization.organizationId),
    listLeases(authorization.organizationId),
    listTenants(authorization.organizationId),
  ]);
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const contactById = new Map(tenants.map((tenant) => [tenant.id, { phone: tenant.phone ?? null, email: tenant.email ?? null }]));
  let rows: DueOverviewRow[] = dues.flatMap((due) => {
    const lease = leaseById.get(due.leaseId);
    if (!lease) return [];
    const breakdown = dueBreakdown(due);
    const contact = contactById.get(due.tenantId);
    return [{
      dueId: due.id, leaseId: due.leaseId, tenantId: due.tenantId, tenantName: lease.tenantName, unitLabel: lease.unitLabel, propertyName: lease.propertyName,
      reference: due.reference, kind: due.kind, dueDate: due.dueDate, periodStart: due.periodStart, periodEnd: due.periodEnd, noticeDate: due.noticeDate,
      totalXaf: breakdown.totalXaf, paidXaf: breakdown.creditAppliedXaf + breakdown.paymentsReceivedXaf, remainingXaf: breakdown.remainingXaf, status: due.status,
      phone: contact?.phone ?? null, email: contact?.email ?? null,
    }];
  });
  const leaseId = scalar(query.lease);
  const tenantId = scalar(query.tenant);
  let scopeLabel: string | null = null;
  if (isUuid(leaseId)) {
    rows = rows.filter((row) => row.leaseId === leaseId);
    scopeLabel = rows[0] ? `${rows[0].tenantName} · ${rows[0].unitLabel}` : "ce bail";
  } else if (isUuid(tenantId)) {
    rows = rows.filter((row) => row.tenantId === tenantId);
    scopeLabel = rows[0]?.tenantName ?? "ce locataire";
  }
  const today = new Date().toISOString().slice(0, 10);
  return <DuesOverviewView canManage={authorization.capabilities.includes("lease.manage")} canRecord={authorization.capabilities.includes("payment.record")} rows={rows} scopeLabel={scopeLabel} today={today} />;
}
