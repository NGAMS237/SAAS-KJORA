import { redirect } from "next/navigation";
import { PinLockScreen } from "@/core/security/pin-lock-screen";
import { sanitizePortalPath } from "@/core/security/pin-lock";
import { loadPortalContext } from "@/tenant-portal/server";

export default async function PortalLockPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const context = await loadPortalContext();
  if (!context?.activeAccess) redirect("/portal/connexion?reason=portal-access-required");
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  return <PinLockScreen
    language={context.activeAccess.preferredLanguage}
    nextPath={sanitizePortalPath(requested)}
    scope="portal"
    userId={context.userId}
  />;
}
