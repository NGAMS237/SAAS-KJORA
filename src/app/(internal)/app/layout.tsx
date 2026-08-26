import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { InternalShell } from "@/core/shell/internal-shell";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const context = await loadOrganizationContext();
  if (!context.activeOrganization) redirect("/onboarding/organization");
  return (
    <InternalShell
      activeOrganization={context.activeOrganization}
      organizations={context.organizations}
      userEmail={context.user.email}
    >
      {children}
    </InternalShell>
  );
}
