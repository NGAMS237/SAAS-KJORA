import { getActiveAuthorization } from "@/core/authorization/server";
import { isUuid } from "@/modules/notifications/model";
import { getPayments } from "@/modules/payments/server";
import { PaymentsView } from "@/modules/payments/views";
import { MissingTenancyResource } from "@/modules/tenancy/views";

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" && value ? value : null;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [authorization, query] = await Promise.all([getActiveAuthorization(), searchParams]);
  if (!authorization?.capabilities.includes("payment.view")) return <MissingTenancyResource leases />;
  // NCE-01 : filtre ?lease= / ?tenant= (lien de notification). Identifiant
  // invalide → ignoré, jamais une erreur ; la requête reste bornée à
  // l'Organization active (RLS + filtre explicite).
  const leaseId = scalar(query.lease);
  const tenantId = scalar(query.tenant);
  const filter = isUuid(leaseId) ? { leaseId } : isUuid(tenantId) ? { tenantId } : {};
  const payments = await getPayments(authorization.organizationId, filter);
  const scope = "leaseId" in filter
    ? { kind: "lease" as const, label: payments[0] ? `${payments[0].propertyName} · ${payments[0].unitLabel}` : null }
    : "tenantId" in filter
      ? { kind: "tenant" as const, label: payments[0]?.tenantName ?? null }
      : null;
  return <PaymentsView payments={payments} canRecord={authorization.capabilities.includes("payment.record")} scope={scope} />;
}
