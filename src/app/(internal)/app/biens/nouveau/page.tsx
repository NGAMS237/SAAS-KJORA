import { getActiveAuthorization } from "@/core/authorization/server";
import { MissingPropertyResource, PropertyCreateForm } from "@/modules/properties/views";

export default async function NewPropertyPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("property.manage")) return <MissingPropertyResource />;
  return <PropertyCreateForm />;
}
