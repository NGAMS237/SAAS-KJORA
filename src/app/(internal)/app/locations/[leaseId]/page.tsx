import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getLeaseDetail, getLeaseOptions } from "@/modules/tenancy/server";
import { LeaseDetailView, MissingTenancyResource } from "@/modules/tenancy/views";

export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view") || !UUID_PATTERN.test(leaseId)) return <MissingTenancyResource leases />;
  const [lease, options] = await Promise.all([
    getLeaseDetail(authorization.organizationId, leaseId),
    getLeaseOptions(authorization.organizationId),
  ]);
  if (!lease) return <MissingTenancyResource leases />;
  return <LeaseDetailView lease={lease} options={options} canManage={authorization.capabilities.includes("lease.manage")} />;
}
