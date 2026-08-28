import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getLeaseFinancialDetail, getTenantFinancialPosition } from "@/modules/finance/server";
import { getLeaseDetail, getLeaseOptions } from "@/modules/tenancy/server";
import { LeaseDetailView, MissingTenancyResource } from "@/modules/tenancy/views";
import { getPayments } from "@/modules/payments/server";
import { getFinancialDocuments } from "@/modules/documents/server";

export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view") || !UUID_PATTERN.test(leaseId)) return <MissingTenancyResource leases />;
  const canViewFinancial = authorization.capabilities.includes("due.view");
  const canViewPayments = authorization.capabilities.includes("payment.view");
  const [lease, options] = await Promise.all([
    getLeaseDetail(authorization.organizationId, leaseId),
    getLeaseOptions(authorization.organizationId),
  ]);
  if (!lease) return <MissingTenancyResource leases />;
  const canViewDocuments = authorization.capabilities.includes("due.view") || authorization.capabilities.includes("receipt.view");
  const [financial, tenantFinancial, payments, documents] = await Promise.all([
    canViewFinancial ? getLeaseFinancialDetail(authorization.organizationId, leaseId) : Promise.resolve(null),
    canViewFinancial ? getTenantFinancialPosition(authorization.organizationId, lease.tenantId) : Promise.resolve(null),
    canViewPayments ? getPayments(authorization.organizationId, { leaseId }) : Promise.resolve(null),
    canViewDocuments ? getFinancialDocuments(authorization.organizationId, { leaseId }) : Promise.resolve(null),
  ]);
  return <LeaseDetailView lease={lease} options={options} canManage={authorization.capabilities.includes("lease.manage")} financial={financial} tenantFinancial={tenantFinancial} payments={payments} canRecordPayment={authorization.capabilities.includes("payment.record")} documents={documents} canShareDocuments={authorization.capabilities.includes("receipt.share")} emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"} />;
}
