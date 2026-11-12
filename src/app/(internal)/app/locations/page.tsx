import { getActiveAuthorization } from "@/core/authorization/server";
import { listLeases } from "@/modules/tenancy/server";
import { listTenantAmountsDue } from "@/modules/finance/server";
import { isoDaysFromNow } from "@/modules/tenancy/next-period";
import { LeasesView, MissingTenancyResource } from "@/modules/tenancy/views";

export default async function LeasesPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view")) return <MissingTenancyResource leases />;
  const [leases, amountsDue] = await Promise.all([
    listLeases(authorization.organizationId),
    authorization.capabilities.includes("due.view") ? listTenantAmountsDue(authorization.organizationId).catch(() => ({})) : Promise.resolve({}),
  ]);
  const endingBefore = isoDaysFromNow(60);
  return <LeasesView amountsDue={amountsDue} endingBefore={endingBefore} leases={leases} canManage={authorization.capabilities.includes("lease.manage")} />;
}
