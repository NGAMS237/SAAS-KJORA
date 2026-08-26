import type { ReactNode } from "react";
import { PortalShell } from "@/tenant-portal/portal-shell";

export default function TenantPortalLayout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
