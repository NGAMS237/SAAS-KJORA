import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getTenantFinancialDetail } from "@/modules/finance/server";
import { getTenantDetail } from "@/modules/tenancy/server";
import { MissingTenancyResource, TenantDetailView } from "@/modules/tenancy/views";

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.view") || !UUID_PATTERN.test(tenantId)) return <MissingTenancyResource />;
  const canViewFinancial = authorization.capabilities.includes("due.view");
  const [tenant, financial] = await Promise.all([
    getTenantDetail(authorization.organizationId, tenantId),
    canViewFinancial ? getTenantFinancialDetail(authorization.organizationId, tenantId) : Promise.resolve(null),
  ]);
  if (!tenant) return <MissingTenancyResource />;
  return <TenantDetailView tenant={tenant} canManage={authorization.capabilities.includes("tenant.manage")} financial={financial} />;
}
