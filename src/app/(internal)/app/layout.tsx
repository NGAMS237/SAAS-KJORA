import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { InternalShell } from "@/core/shell/internal-shell";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PinLockProvider } from "@/core/security/pin-lock-provider";
import { AuthCompletedTracker } from "@/core/analytics/auth-completed-tracker";
import { getNotifications } from "@/modules/documents/server";
import { getOperationalDashboard } from "@/modules/operations/server";
import { dashboardPeriod } from "@/modules/operations/model";
import { resolveUserContext, destinationFor } from "@/core/routing/context-resolver";

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const context = await loadOrganizationContext();
  if (!context.activeOrganization) {
    // ALIGN-02 — le contexte réel est résolu côté serveur uniquement.
    // Les invitations en attente priment sur toute création d'Organization (§15).
    const resolved = await resolveUserContext();
    redirect(destinationFor(resolved));
  }
  const notifications = context.activeOrganization.capabilities.includes("activity.view")
    ? await getNotifications(context.activeOrganization.id)
    : [];
  const canSeeFinance = context.activeOrganization.capabilities.includes("due.view")
    && context.activeOrganization.capabilities.includes("payment.view");
  const dashboard = canSeeFinance
    ? await getOperationalDashboard(context.activeOrganization.id, dashboardPeriod(null)).catch(() => null)
    : null;
  const paymentAttention = (dashboard?.overdueCount ?? 0) + (dashboard?.partialCount ?? 0);
  const navigationBadges = {
    ...(paymentAttention > 0 ? { "/app/paiements": { count: paymentAttention, tone: "danger" as const } } : {}),
  };
  return (
    <PinLockProvider userId={context.user.id}>
      {/* ALIGN-02 §16 — auth_completed est émis une fois par session de navigateur */}
      <AuthCompletedTracker />
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
    </PinLockProvider>
  );
}
