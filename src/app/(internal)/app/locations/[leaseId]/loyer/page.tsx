import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getLeaseDetail } from "@/modules/tenancy/server";
import { MissingTenancyResource } from "@/modules/tenancy/views";
import { RentCorrectionCard } from "@/modules/tenancy/rent-correction-card";

// Page légère (utilisée dans le tiroir) : uniquement la correction du loyer du locataire choisi.
export default async function LeaseRentPage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.view") || !UUID_PATTERN.test(leaseId)) return <MissingTenancyResource leases />;
  const lease = await getLeaseDetail(authorization.organizationId, leaseId);
  if (!lease || lease.status !== "active") return <MissingTenancyResource leases />;
  return <RentCorrectionCard canManage={authorization.capabilities.includes("lease.manage")} compact currentBaseRentXaf={lease.baseRentXaf} currentChargesXaf={lease.recurringChargesXaf} leaseId={lease.id} />;
}
