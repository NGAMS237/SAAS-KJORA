import { getActiveAuthorization } from "@/core/authorization/server";
import { listActiveProperties } from "@/modules/properties/server";
import { MissingPropertyResource, PropertiesView } from "@/modules/properties/views";

export default async function PropertiesPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("property.view")) return <MissingPropertyResource />;
  const properties = await listActiveProperties(authorization.organizationId);
  return <PropertiesView properties={properties} canManage={authorization.capabilities.includes("property.manage")} />;
}
