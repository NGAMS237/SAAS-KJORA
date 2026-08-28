import { getActiveAuthorization } from "@/core/authorization/server";
import { getPayments } from "@/modules/payments/server";
import { PaymentsView } from "@/modules/payments/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";

export default async function PaymentsPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("payment.view")) return <MissingTenancyResource leases />;
  const payments = await getPayments(authorization.organizationId);
  return <PaymentsView payments={payments} canRecord={authorization.capabilities.includes("payment.record")} />;
}
