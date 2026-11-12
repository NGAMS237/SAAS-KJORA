import { getUserGreetingName } from "@/core/auth/user-display-name";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PinSetupPrompt } from "@/core/security/pin-controls";
import { dashboardPeriod } from "@/modules/operations/model";
import { getOperationalDashboard, getOrganizationActivity } from "@/modules/operations/server";
import { DashboardOperationalView } from "@/modules/operations/views";
import { DashboardFocus } from "@/modules/operations/dashboard-focus";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const [context, query] = await Promise.all([loadOrganizationContext(), searchParams]);
  const organization = context.activeOrganization;
  if (!organization) return null;
  const rawMonth = typeof query.month === "string" ? query.month : null;
  const period = dashboardPeriod(rawMonth);
  const [dashboard, activity] = await Promise.all([
    getOperationalDashboard(organization.id, period),
    organization.capabilities.includes("activity.view")
      ? getOrganizationActivity(organization.id, { createdAt: null, id: null }, 5)
      : Promise.resolve([]),
  ]);
  const canSeeFinance = organization.capabilities.includes("due.view") && organization.capabilities.includes("tenant.view");
  return <>
    {canSeeFinance ? <DashboardFocus organizationId={organization.id} /> : null}
    <DashboardOperationalView
      activity={activity}
      dashboard={dashboard}
      greetingName={getUserGreetingName(context.user.userMetadata, context.user.email)}
      organizationName={organization.name}
      period={period}
    />
    <PinSetupPrompt />
  </>;
}
