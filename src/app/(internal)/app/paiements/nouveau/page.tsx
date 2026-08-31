import { getActiveAuthorization } from "@/core/authorization/server";
import { getPaymentLeaseOptions } from "@/modules/payments/server";
import { NewPaymentView } from "@/modules/payments/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ lease?: string; amount?: string; initial?: string }> }) {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("payment.record")) return <MissingTenancyResource leases />;
  const [query, options] = await Promise.all([searchParams, getPaymentLeaseOptions(authorization.organizationId)]);
  const parsedAmount = Number(query.amount ?? 0);
  return <NewPaymentView options={options} initialLeaseId={query.lease} initialAmountXaf={Number.isSafeInteger(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0} initialAllocation={query.initial === "1"} />;
}
