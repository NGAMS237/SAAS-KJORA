import { getActiveAuthorization } from "@/core/authorization/server";
import { getTenantFinancialDetail } from "@/modules/finance/server";
import { LedgerStatementView } from "@/modules/finance/views";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getTenantDetail } from "@/modules/tenancy/server";
import { MissingTenancyResource } from "@/modules/tenancy/views";
import { getFinancialDocuments } from "@/modules/documents/server";

export default async function StatementPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("due.view") || !UUID_PATTERN.test(tenantId)) return <MissingTenancyResource />;
  const [tenant, financial, documents] = await Promise.all([
    getTenantDetail(authorization.organizationId, tenantId),
    getTenantFinancialDetail(authorization.organizationId, tenantId),
    getFinancialDocuments(authorization.organizationId, { tenantId }),
  ]);
  if (!tenant) return <MissingTenancyResource />;
  return <LedgerStatementView tenantId={tenantId} tenantName={tenant.fullName} financial={financial} statementDocuments={documents.filter((document) => document.type === "account_statement")} />;
}
