import { getActiveAuthorization } from "@/core/authorization/server";
import { listLeases } from "@/modules/tenancy/server";
import { LeasesView, MissingTenancyResource } from "@/modules/tenancy/views";

export default async function LeasesPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view")) return <MissingTenancyResource leases />;
  const leases = await listLeases(authorization.organizationId);
  return <LeasesView leases={leases} canManage={authorization.capabilities.includes("lease.manage")} />;
}
