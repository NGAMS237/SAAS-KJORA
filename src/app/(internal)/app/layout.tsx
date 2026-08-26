import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { InternalShell } from "@/core/shell/internal-shell";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PinLockProvider } from "@/core/security/pin-lock-provider";

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const context = await loadOrganizationContext();
  if (!context.activeOrganization) redirect("/onboarding/organization");
  return (
    <PinLockProvider userId={context.user.id}>
      <InternalShell
        activeOrganization={context.activeOrganization}
        organizations={context.organizations}
        userEmail={context.user.email}
        userId={context.user.id}
      >
        {children}
      </InternalShell>
    </PinLockProvider>
  );
}
