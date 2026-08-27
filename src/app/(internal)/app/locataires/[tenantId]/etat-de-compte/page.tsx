import { getActiveAuthorization } from "@/core/authorization/server";
import { getTenantFinancialDetail } from "@/modules/finance/server";
import { LedgerStatementView } from "@/modules/finance/views";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getTenantDetail } from "@/modules/tenancy/server";
import { MissingTenancyResource } from "@/modules/tenancy/views";

export default async function StatementPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("due.view") || !UUID_PATTERN.test(tenantId)) return <MissingTenancyResource />;
  const [tenant, financial] = await Promise.all([
    getTenantDetail(authorization.organizationId, tenantId),
    getTenantFinancialDetail(authorization.organizationId, tenantId),
  ]);
  if (!tenant) return <MissingTenancyResource />;
  return <LedgerStatementView tenantName={tenant.fullName} financial={financial} />;
}
