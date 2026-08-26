import { getActiveAuthorization } from "@/core/authorization/server";
import { listTenants } from "@/modules/tenancy/server";
import { MissingTenancyResource, TenantsView } from "@/modules/tenancy/views";

export default async function TenantsPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.view")) return <MissingTenancyResource />;
  const tenants = await listTenants(authorization.organizationId);
  return <TenantsView tenants={tenants} canManage={authorization.capabilities.includes("tenant.manage")} />;
}
