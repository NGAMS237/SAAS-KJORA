import { getActiveAuthorization } from "@/core/authorization/server";
import { getNotifications } from "@/modules/documents/server";
import { NotificationsView } from "@/modules/documents/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";

export default async function ActivityPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("activity.view")) return <MissingTenancyResource />;
  const notifications = await getNotifications(authorization.organizationId);
  return <NotificationsView notifications={notifications} />;
}
