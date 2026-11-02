import { getActiveAuthorization } from "@/core/authorization/server";
import { listTenants } from "@/modules/tenancy/server";
import { listTenantAmountsDue } from "@/modules/finance/server";
import { MissingTenancyResource, TenantsView } from "@/modules/tenancy/views";

export default async function TenantsPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.view")) return <MissingTenancyResource />;
  const canViewDues = authorization.capabilities.includes("due.view");
  const [tenants, amountsDue] = await Promise.all([
    listTenants(authorization.organizationId),
    canViewDues ? listTenantAmountsDue(authorization.organizationId).catch(() => ({})) : Promise.resolve({}),
  ]);
  return <TenantsView amountsDue={amountsDue} tenants={tenants} canManage={authorization.capabilities.includes("tenant.manage")} />;
}
