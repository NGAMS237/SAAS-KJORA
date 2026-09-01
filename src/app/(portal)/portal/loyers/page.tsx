import { notFound } from "next/navigation";
import { getPortalDues, getPortalHome, getPortalPayments, loadPortalContext } from "@/tenant-portal/server";
import { PortalDuesView, PortalPaymentsView, selectedLease } from "@/tenant-portal/views";

export default async function PortalRentsPage({ searchParams }: { searchParams: Promise<{ lease?: string }> }) {
  const [context, query] = await Promise.all([loadPortalContext(), searchParams]);
  if (!context?.activeAccess) notFound();
  const home = await getPortalHome(context.activeAccess.accessId);
  const lease = selectedLease(home, query.lease);
  if (!lease) notFound();
  const [dues, payments] = await Promise.all([
    getPortalDues(context.activeAccess.accessId, lease.id),
    getPortalPayments(context.activeAccess.accessId, lease.id),
  ]);
  return <><PortalDuesView dues={dues} home={home} language={context.activeAccess.preferredLanguage} lease={lease} /><PortalPaymentsView home={home} language={context.activeAccess.preferredLanguage} payments={payments} /></>;
}
