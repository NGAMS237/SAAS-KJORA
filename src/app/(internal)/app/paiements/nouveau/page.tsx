import { getActiveAuthorization } from "@/core/authorization/server";
import { getPaymentLeaseOptions } from "@/modules/payments/server";
import { NewPaymentView } from "@/modules/payments/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ lease?: string }> }) {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("payment.record")) return <MissingTenancyResource leases />;
  const [{ lease }, options] = await Promise.all([searchParams, getPaymentLeaseOptions(authorization.organizationId)]);
  return <NewPaymentView options={options} initialLeaseId={lease} />;
}
