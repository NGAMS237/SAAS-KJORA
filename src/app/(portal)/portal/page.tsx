import { notFound } from "next/navigation";
import { getPortalHome, loadPortalContext } from "@/tenant-portal/server";
import { PortalHomeView } from "@/tenant-portal/views";

export default async function PortalHomePage({ searchParams }: { searchParams: Promise<{ lease?: string }> }) {
  const [context, query] = await Promise.all([loadPortalContext(), searchParams]);
  if (!context?.activeAccess) notFound();
  const home = await getPortalHome(context.activeAccess.accessId);
  return <PortalHomeView home={home} language={context.activeAccess.preferredLanguage} requestedLease={query.lease} />;
}
