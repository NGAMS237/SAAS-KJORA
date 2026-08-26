import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getPropertyDetail } from "@/modules/properties/server";
import { MissingPropertyResource, PropertyDetailView } from "@/modules/properties/views";

export default async function PropertyPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("property.view") || !UUID_PATTERN.test(propertyId)) {
    return <MissingPropertyResource />;
  }
  const property = await getPropertyDetail(authorization.organizationId, propertyId);
  if (!property || property.status !== "active") return <MissingPropertyResource />;
  return (
    <PropertyDetailView
      property={property}
      canManageProperty={authorization.capabilities.includes("property.manage")}
      canManageUnits={authorization.capabilities.includes("unit.manage")}
    />
  );
}
