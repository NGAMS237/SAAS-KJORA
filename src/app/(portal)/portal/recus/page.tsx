import { notFound } from "next/navigation";
import { getPortalDocuments, getPortalHome, loadPortalContext } from "@/tenant-portal/server";
import { PortalDocumentsView, selectedLease } from "@/tenant-portal/views";

export default async function PortalReceiptsPage({ searchParams }: { searchParams: Promise<{ lease?: string }> }) {
  const [context, query] = await Promise.all([loadPortalContext(), searchParams]);
  if (!context?.activeAccess) notFound();
  const home = await getPortalHome(context.activeAccess.accessId);
  const lease = selectedLease(home, query.lease);
  if (!lease) notFound();
  const documents = await getPortalDocuments(context.activeAccess.accessId, lease.id);
  return <PortalDocumentsView documents={documents} home={home} language={context.activeAccess.preferredLanguage} lease={lease} />;
}
