import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getLeaseFinancialDetail, getTenantFinancialPosition } from "@/modules/finance/server";
import { getLeaseDetail, getLeaseOptions } from "@/modules/tenancy/server";
import { LeaseDetailView, MissingTenancyResource } from "@/modules/tenancy/views";
import { getPayments } from "@/modules/payments/server";
import { getFinancialDocuments } from "@/modules/documents/server";
import Link from "next/link";

export default async function LeasePage({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ initialReceived?: string }> }) {
  const [{ leaseId }, query] = await Promise.all([params, searchParams]);
  const parsedInitialReceived = Number(query.initialReceived ?? 0);
  const initialReceivedXaf = Number.isSafeInteger(parsedInitialReceived) && parsedInitialReceived > 0 ? parsedInitialReceived : 0;
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
  return <><LeaseDetailView lease={lease} options={options} canManage={authorization.capabilities.includes("lease.manage")} financial={financial} tenantFinancial={tenantFinancial} payments={payments} canRecordPayment={authorization.capabilities.includes("payment.record")} documents={documents} canShareDocuments={authorization.capabilities.includes("receipt.share")} emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"} initialReceivedXaf={initialReceivedXaf} />
    {authorization.capabilities.includes("contract.manage") ? <div className="lease-contract-entry"><Link className="button button--secondary" href={`/app/locations/${lease.id}/contrat`}>Générer ou consulter le contrat</Link><small>Facultatif · le bail n’est jamais bloqué par ce document.</small></div> : null}</>;
}
