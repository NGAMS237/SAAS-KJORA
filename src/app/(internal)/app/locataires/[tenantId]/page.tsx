import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getTenantFinancialDetail } from "@/modules/finance/server";
import { getTenantDetail } from "@/modules/tenancy/server";
import { getPayments } from "@/modules/payments/server";
import { MissingTenancyResource, TenantDetailView } from "@/modules/tenancy/views";
import { getFinancialDocuments } from "@/modules/documents/server";

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.view") || !UUID_PATTERN.test(tenantId)) return <MissingTenancyResource />;
  const canViewFinancial = authorization.capabilities.includes("due.view");
  const canViewPayments = authorization.capabilities.includes("payment.view");
  const canViewDocuments = authorization.capabilities.includes("due.view") || authorization.capabilities.includes("receipt.view");
  const [tenant, financial, payments, documents] = await Promise.all([
    getTenantDetail(authorization.organizationId, tenantId),
    canViewFinancial ? getTenantFinancialDetail(authorization.organizationId, tenantId) : Promise.resolve(null),
    canViewPayments ? getPayments(authorization.organizationId, { tenantId }) : Promise.resolve(null),
    canViewDocuments ? getFinancialDocuments(authorization.organizationId, { tenantId }) : Promise.resolve(null),
  ]);
  if (!tenant) return <MissingTenancyResource />;
  return <TenantDetailView tenant={tenant} canManage={authorization.capabilities.includes("tenant.manage")} financial={financial} payments={payments} canRecordPayment={authorization.capabilities.includes("payment.record")} documents={documents} canShareDocuments={authorization.capabilities.includes("receipt.share")} emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"} />;
}
