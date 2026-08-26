import { getActiveAuthorization } from "@/core/authorization/server";
import { MissingTenancyResource, TenantCreateForm } from "@/modules/tenancy/views";

export default async function NewTenantPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.manage")) return <MissingTenancyResource />;
  return <TenantCreateForm />;
}
