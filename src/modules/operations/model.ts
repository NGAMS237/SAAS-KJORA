export type DashboardPeriod = {
  key: string;
  from: string;
  to: string;
};

export type OperationalDashboard = {
  periodFrom: string;
  periodTo: string;
  financeAvailable: boolean;
  portfolioAvailable: boolean;
  expectedXaf: number | null;
  collectedXaf: number | null;
  creditAppliedXaf: number | null;
  remainingXaf: number | null;
  overdueXaf: number | null;
  overdueCount: number | null;
  overdueTenantCount: number | null;
  upcomingCount: number | null;
  partialCount: number | null;
  activeTenantCount: number | null;
  unitCount: number | null;
  occupiedUnitCount: number | null;
};

export type ActivityEvent = {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  contextLabel: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  actorUserId: string;
  actorEmail: string | null;
  targetEmail: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type OperationalHealth = {
  dailyJob: { status: string; startedAt: string | null; finishedAt: string | null } | null;
  documentBacklog: number;
  documentFailures: number;
  deliveryCounts: Record<string, number>;
  communicationSettings: Record<string, boolean | string | null>;
};

export type AuditFilters = {
  action: string | null;
  actor: string | null;
  from: string | null;
  to: string | null;
  cursorAt: string | null;
  cursorId: string | null;
};

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function dashboardPeriod(month: string | null | undefined, fallback = new Date()): DashboardPeriod {
  const fallbackKey = `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = month && MONTH_PATTERN.test(month) ? month : fallbackKey;
  const [year, monthNumber] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { key, from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, "0")}` };
}

export function shiftDashboardPeriod(period: DashboardPeriod, delta: number) {
  const [year, month] = period.key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return dashboardPeriod(`${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`);
}

export function parseAuditFilters(input: Record<string, string | string[] | undefined>): AuditFilters {
  const scalar = (value: string | string[] | undefined) => typeof value === "string" && value ? value : null;
  const action = scalar(input.action);
  const actor = scalar(input.actor);
  const from = scalar(input.from);
  const to = scalar(input.to);
  const cursorAt = scalar(input.cursorAt);
  const cursorId = scalar(input.cursorId);
  return {
    action: action && /^[a-z._]+$/.test(action) ? action : null,
    actor: actor && UUID_PATTERN.test(actor) ? actor : null,
    from: from && ISO_DATE_PATTERN.test(from) ? from : null,
    to: to && ISO_DATE_PATTERN.test(to) ? to : null,
    cursorAt: cursorAt && !Number.isNaN(Date.parse(cursorAt)) ? cursorAt : null,
    cursorId: cursorId && UUID_PATTERN.test(cursorId) ? cursorId : null,
  };
}

export function activityHref(event: Pick<ActivityEvent, "type" | "aggregateId" | "payload">) {
  if (event.type === "PROPERTY_CREATED") return `/app/biens/${event.aggregateId}`;
  if (event.type === "TENANT_CREATED") return `/app/locataires/${event.aggregateId}`;
  if (event.type.startsWith("LEASE_")) return `/app/locations/${event.aggregateId}`;
  if (event.type.startsWith("PAYMENT_")) {
    const paymentId = typeof event.payload.payment_id === "string" ? event.payload.payment_id : event.aggregateId;
    return `/app/paiements/${paymentId}`;
  }
  if (event.type.startsWith("DUE_")) {
    const leaseId = typeof event.payload.lease_id === "string" ? event.payload.lease_id : null;
    return leaseId ? `/app/locations/${leaseId}` : "/app/paiements";
  }
  if (event.type.startsWith("DOCUMENT_")) {
    return `/api/financial-documents/${event.aggregateId}/download`;
  }
  return null;
}

export function notificationHref(notification: {
  documentId: string | null;
  tenantId: string | null;
  leaseId: string | null;
}) {
  if (notification.documentId) return `/api/financial-documents/${notification.documentId}/download`;
  if (notification.tenantId) return `/app/locataires/${notification.tenantId}`;
  if (notification.leaseId) return `/app/locations/${notification.leaseId}`;
  return "/app/activite";
}
