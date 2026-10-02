import { notFound } from "next/navigation";
import { getPortalHome, loadPortalContext } from "@/tenant-portal/server";
import { PortalAccountView } from "@/tenant-portal/views";

export default async function PortalAccountPage() {
  const context = await loadPortalContext();
  if (!context?.activeAccess) notFound();
  const home = await getPortalHome(context.activeAccess.accessId);
  return <PortalAccountView accessId={context.activeAccess.accessId} home={home} language={context.activeAccess.preferredLanguage} />;
}
