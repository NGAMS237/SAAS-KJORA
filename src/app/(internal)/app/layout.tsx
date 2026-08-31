import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { InternalShell } from "@/core/shell/internal-shell";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PinLockProvider } from "@/core/security/pin-lock-provider";
import { DemoRentalProvider } from "@/modules/rental-demo/store";
import { getNotifications } from "@/modules/documents/server";
import { getOperationalDashboard } from "@/modules/operations/server";
import { dashboardPeriod } from "@/modules/operations/model";

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const context = await loadOrganizationContext();
  if (!context.activeOrganization) redirect("/onboarding/organization");
  const notifications = context.activeOrganization.capabilities.includes("activity.view")
    ? await getNotifications(context.activeOrganization.id)
    : [];
  const canSeeFinance = context.activeOrganization.capabilities.includes("due.view")
    && context.activeOrganization.capabilities.includes("payment.view");
  const dashboard = canSeeFinance
    ? await getOperationalDashboard(context.activeOrganization.id, dashboardPeriod(null)).catch(() => null)
    : null;
  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length;
  const paymentAttention = (dashboard?.overdueCount ?? 0) + (dashboard?.partialCount ?? 0);
  const navigationBadges = {
    ...(paymentAttention > 0 ? { "/app/paiements": { count: paymentAttention, tone: "danger" as const } } : {}),
    ...(unreadNotifications > 0 ? { "/app/activite": { count: unreadNotifications, tone: "info" as const } } : {}),
  };
  return (
    <PinLockProvider userId={context.user.id}>
      <DemoRentalProvider key={context.activeOrganization.id}>
        <InternalShell
          activeOrganization={context.activeOrganization}
          organizations={context.organizations}
          userEmail={context.user.email}
          userId={context.user.id}
          notifications={notifications}
          navigationBadges={navigationBadges}
        >
          {children}
        </InternalShell>
      </DemoRentalProvider>
    </PinLockProvider>
  );
}
