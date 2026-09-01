import { notFound } from "next/navigation";
import { getPortalNotifications, loadPortalContext } from "@/tenant-portal/server";
import { PortalNotificationsView } from "@/tenant-portal/notifications-view";

export default async function PortalNotificationsPage() {
  const context = await loadPortalContext();
  if (!context?.activeAccess) notFound();
  const notifications = await getPortalNotifications(context.activeAccess.accessId);
  return <PortalNotificationsView language={context.activeAccess.preferredLanguage} notifications={notifications} />;
}
