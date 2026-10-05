import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PortalShell } from "@/tenant-portal/portal-shell";
import { getPortalNotifications, loadPortalContext } from "@/tenant-portal/server";
import { PinLockProvider } from "@/core/security/pin-lock-provider";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function TenantPortalLayout({ children }: { children: ReactNode }) {
  const context = await loadPortalContext();
  if (!context?.activeAccess) {
    // REVENUE-LAUNCH-01 v3 — Organization suspendue/archivée : message dédié,
    // jamais confondu avec un accès révoqué.
    redirect(context && context.unavailableOrganizations.length > 0
      ? "/portal/connexion?reason=organization-unavailable"
      : "/portal/connexion?reason=portal-access-required");
  }
  const notifications = await getPortalNotifications(context.activeAccess.accessId);
  return <PinLockProvider scope="portal" userId={context.userId}>
    <PortalShell
      accessId={context.activeAccess.accessId}
      accesses={context.accesses}
      language={context.activeAccess.preferredLanguage}
      organizationName={context.activeAccess.organizationName}
      notifications={notifications}
      userId={context.userId}
    >{children}</PortalShell>
  </PinLockProvider>;
}
