import { getActiveAuthorization } from "@/core/authorization/server";
import { getLeaseOptions } from "@/modules/tenancy/server";
import { LeaseCreateForm, MissingTenancyResource } from "@/modules/tenancy/views";

export default async function NewLeasePage({ searchParams }: { searchParams: Promise<{ tenant?: string; unit?: string }> }) {
  const { tenant, unit } = await searchParams;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("lease.manage")) return <MissingTenancyResource leases />;
  const options = await getLeaseOptions(authorization.organizationId);
  return <LeaseCreateForm options={options} initialTenantId={tenant} initialUnitId={unit} />;
}
