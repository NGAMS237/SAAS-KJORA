import { getActiveAuthorization } from "@/core/authorization/server";
import { getNotifications } from "@/modules/documents/server";
import { parseAuditFilters } from "@/modules/operations/model";
import { getOperationalAudit, getOperationalHealth, getOrganizationActivity } from "@/modules/operations/server";
import { OperationsPageView } from "@/modules/operations/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" && value ? value : null;
}

function withQuery(input: Record<string, string | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value) query.set(key, value);
  return `/app/activite?${query.toString()}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [authorization, query] = await Promise.all([getActiveAuthorization(), searchParams]);
  if (!authorization?.capabilities.includes("activity.view")) return <MissingTenancyResource />;
  const filters = parseAuditFilters(query);
  const activityCursor = { createdAt: scalar(query.activityAt), id: scalar(query.activityId) };
  const isOwner = authorization.capabilities.includes("audit.view");
  const [activity, notifications, auditEntries, health] = await Promise.all([
    getOrganizationActivity(authorization.organizationId, activityCursor, 25),
    getNotifications(authorization.organizationId),
    isOwner ? getOperationalAudit(authorization.organizationId, filters, 25) : Promise.resolve(null),
    isOwner ? getOperationalHealth(authorization.organizationId) : Promise.resolve(null),
  ]);
  const lastActivity = activity.at(-1);
  const lastAudit = auditEntries?.at(-1);
  const baseFilters = { action: filters.action, actor: filters.actor, from: filters.from, to: filters.to };
  const activityNextHref = activity.length === 25 && lastActivity ? withQuery({
    ...baseFilters, activityAt: lastActivity.createdAt, activityId: lastActivity.id,
  }) : null;
  const auditNextHref = auditEntries?.length === 25 && lastAudit ? withQuery({
    ...baseFilters, cursorAt: lastAudit.createdAt, cursorId: lastAudit.id,
  }) : null;
  return <OperationsPageView
    activity={activity}
    activityNextHref={activityNextHref}
    auditEntries={auditEntries}
    auditFilters={filters}
    auditNextHref={auditNextHref}
    currentUserId={authorization.userId}
    emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"}
    health={health}
    notifications={notifications}
  />;
}
