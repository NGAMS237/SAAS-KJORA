import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getPaymentDetail } from "@/modules/payments/server";
import { PaymentDetailView } from "@/modules/payments/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";
import { getFinancialDocuments } from "@/modules/documents/server";

export default async function PaymentPage({ params, searchParams }: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const [{ paymentId }, query, authorization] = await Promise.all([params, searchParams, getActiveAuthorization()]);
  if (!authorization?.capabilities.includes("payment.view") || !UUID_PATTERN.test(paymentId)) return <MissingTenancyResource leases />;
  const [payment, documents] = await Promise.all([
    getPaymentDetail(authorization.organizationId, paymentId),
    authorization.capabilities.includes("receipt.view")
      ? getFinancialDocuments(authorization.organizationId, { paymentId }) : Promise.resolve([]),
  ]);
  if (!payment) return <MissingTenancyResource leases />;
  return <PaymentDetailView payment={payment} canCorrect={authorization.capabilities.includes("payment.correct")} currentUserId={authorization.userId} success={query.success === "1"} documents={documents} canShare={authorization.capabilities.includes("receipt.share")} emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"} />;
}
