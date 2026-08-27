import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getLeaseFinancialDetail, getTenantFinancialPosition } from "@/modules/finance/server";
import { getLeaseDetail, getLeaseOptions } from "@/modules/tenancy/server";
import { LeaseDetailView, MissingTenancyResource } from "@/modules/tenancy/views";

export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view") || !UUID_PATTERN.test(leaseId)) return <MissingTenancyResource leases />;
  const canViewFinancial = authorization.capabilities.includes("due.view");
  const [lease, options] = await Promise.all([
    getLeaseDetail(authorization.organizationId, leaseId),
    getLeaseOptions(authorization.organizationId),
  ]);
  if (!lease) return <MissingTenancyResource leases />;
  const [financial, tenantFinancial] = canViewFinancial
    ? await Promise.all([
        getLeaseFinancialDetail(authorization.organizationId, leaseId),
        getTenantFinancialPosition(authorization.organizationId, lease.tenantId),
      ])
    : [null, null];
  return <LeaseDetailView lease={lease} options={options} canManage={authorization.capabilities.includes("lease.manage")} financial={financial} tenantFinancial={tenantFinancial} />;
}
