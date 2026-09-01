import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PortalShell } from "@/tenant-portal/portal-shell";
import { loadPortalContext } from "@/tenant-portal/server";

export const dynamic = "force-dynamic";

export default async function TenantPortalLayout({ children }: { children: ReactNode }) {
  const context = await loadPortalContext();
  if (!context?.activeAccess) redirect("/portal/connexion?reason=portal-access-required");
  return <PortalShell
    accessId={context.activeAccess.accessId}
    accesses={context.accesses}
    language={context.activeAccess.preferredLanguage}
    organizationName={context.activeAccess.organizationName}
  >{children}</PortalShell>;
}
