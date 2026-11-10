import { getActiveAuthorization } from "@/core/authorization/server";
import { listTenantAmountsDue } from "@/modules/finance/server";
import { MessagesView, type MessageTenant } from "@/modules/communications/messages-view";
import { listTenants } from "@/modules/tenancy/server";
import { MissingTenancyResource } from "@/modules/tenancy/views";

export default async function MessagesPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.view")) return <MissingTenancyResource />;
  const canViewDues = authorization.capabilities.includes("due.view");
  const [tenants, amountsDue] = await Promise.all([
    listTenants(authorization.organizationId),
    canViewDues ? listTenantAmountsDue(authorization.organizationId).catch(() => ({} as Record<string, number>)) : Promise.resolve({} as Record<string, number>),
  ]);
  const items: MessageTenant[] = tenants
    .filter((tenant) => tenant.currentLease)
    .map((tenant) => ({
      id: tenant.id, fullName: tenant.fullName, phone: tenant.phone ?? null, email: tenant.email ?? null,
      unitLabel: tenant.currentLease?.unitLabel ?? null, baseRentXaf: tenant.currentLease?.baseRentXaf ?? 0,
      chargesXaf: tenant.currentLease?.recurringChargesXaf ?? 0, dueDay: tenant.currentLease?.dueDay ?? null,
      amountDueXaf: amountsDue[tenant.id] ?? 0,
    }))
    .sort((a, b) => b.amountDueXaf - a.amountDueXaf || a.fullName.localeCompare(b.fullName));
  return <MessagesView tenants={items} />;
}
