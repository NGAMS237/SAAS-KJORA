import { getActiveAuthorization } from "@/core/authorization/server";
import { requirePlanFeature } from "@/core/entitlements/server";
import type { EntitlementError } from "@/core/entitlements/model";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getLeaseFinancialDetail, getTenantFinancialPosition } from "@/modules/finance/server";
import { getLeaseDetail, getLeaseOptions } from "@/modules/tenancy/server";
import { LeaseDetailView, MissingTenancyResource } from "@/modules/tenancy/views";
import { getPayments } from "@/modules/payments/server";
import { getFinancialDocuments } from "@/modules/documents/server";
import { ContractEntryLink } from "@/modules/contracts/entry-link";
import { listLeaseCoTenants } from "@/modules/tenancy/co-tenants";
import { LeaseCoTenantsCard } from "@/modules/tenancy/co-tenants-card";
import { listScheduledRentTerms } from "@/modules/tenancy/rent-terms";
import { earliestRentChangeDate } from "@/modules/tenancy/rent-dates";
import { getLeaseContractDates } from "@/modules/tenancy/contract-dates";
import { LeaseTermsCard } from "@/modules/tenancy/lease-terms-card";
import { RentChangeCard } from "@/modules/tenancy/rent-change-card";

export default async function LeasePage({ params, searchParams }: { params: Promise<{ leaseId: string }>; searchParams: Promise<{ initialReceived?: string }> }) {
  const [{ leaseId }, query] = await Promise.all([params, searchParams]);
  const parsedInitialReceived = Number(query.initialReceived ?? 0);
  const initialReceivedXaf = Number.isSafeInteger(parsedInitialReceived) && parsedInitialReceived > 0 ? parsedInitialReceived : 0;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view") || !UUID_PATTERN.test(leaseId)) return <MissingTenancyResource leases />;
  const canViewFinancial = authorization.capabilities.includes("due.view");
  const canViewPayments = authorization.capabilities.includes("payment.view");
  // ALIGN-01 — plan feature gating: contracts requires Essentiel+
  const hasContractRbac = authorization.capabilities.includes("contract.manage");
  const [lease, options, contractEntitlementError] = await Promise.all([
    getLeaseDetail(authorization.organizationId, leaseId),
    getLeaseOptions(authorization.organizationId),
    hasContractRbac ? requirePlanFeature(authorization.organizationId, "contracts") : Promise.resolve<EntitlementError | null>(null),
  ]);
  if (!lease) return <MissingTenancyResource leases />;
  const canViewDocuments = authorization.capabilities.includes("due.view") || authorization.capabilities.includes("receipt.view");
  const [financial, tenantFinancial, payments, documents] = await Promise.all([
    canViewFinancial ? getLeaseFinancialDetail(authorization.organizationId, leaseId) : Promise.resolve(null),
    canViewFinancial ? getTenantFinancialPosition(authorization.organizationId, lease.tenantId) : Promise.resolve(null),
    canViewPayments ? getPayments(authorization.organizationId, { leaseId }) : Promise.resolve(null),
    canViewDocuments ? getFinancialDocuments(authorization.organizationId, { leaseId }) : Promise.resolve(null),
  ]);
  const contractDates = await getLeaseContractDates(authorization.organizationId, leaseId);
  const coTenants = await listLeaseCoTenants(authorization.organizationId, leaseId);
  const scheduledRent = lease.status === "active" ? await listScheduledRentTerms(authorization.organizationId, leaseId) : [];
  return <><LeaseDetailView lease={lease} options={options} canManage={authorization.capabilities.includes("lease.manage")} financial={financial} tenantFinancial={tenantFinancial} payments={payments} canRecordPayment={authorization.capabilities.includes("payment.record")} documents={documents} canShareDocuments={authorization.capabilities.includes("receipt.share")} emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"} initialReceivedXaf={initialReceivedXaf} />
    <LeaseTermsCard canManage={authorization.capabilities.includes("lease.manage")} contract={contractDates} terms={{ leaseId: lease.id, status: lease.status, startDate: lease.startDate, endDate: lease.endDate ?? null, baseRentXaf: lease.baseRentXaf, recurringChargesXaf: lease.recurringChargesXaf, securityDepositXaf: lease.securityDepositXaf, dueDay: lease.dueDay, billingFrequency: lease.billingFrequency }} />
    {lease.status === "active" ? <RentChangeCard canManage={authorization.capabilities.includes("lease.manage")} currentBaseRentXaf={lease.baseRentXaf} currentChargesXaf={lease.recurringChargesXaf} earliestDate={earliestRentChangeDate(financial?.dues ?? [])} leaseId={lease.id} scheduled={scheduledRent} /> : null}
    {coTenants.available ? <LeaseCoTenantsCard canManage={authorization.capabilities.includes("lease.manage")} candidates={options.tenants} holderTenantId={lease.tenantId} items={coTenants.items} leaseId={lease.id} /> : null}
    {hasContractRbac ? <ContractEntryLink currentPlan={contractEntitlementError?.plan ?? "decouverte"} entitled={!contractEntitlementError} leaseId={lease.id} /> : null}</>;
}
