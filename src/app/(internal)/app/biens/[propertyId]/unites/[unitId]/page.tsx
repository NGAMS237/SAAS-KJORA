import { getActiveAuthorization } from "@/core/authorization/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { getUnitDetail } from "@/modules/properties/server";
import { MissingPropertyResource, UnitDetailView } from "@/modules/properties/views";

export default async function UnitPage({ params }: { params: Promise<{ propertyId: string; unitId: string }> }) {
  const { propertyId, unitId } = await params;
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("unit.view") || !UUID_PATTERN.test(propertyId) || !UUID_PATTERN.test(unitId)) {
    return <MissingPropertyResource />;
  }
  const detail = await getUnitDetail(authorization.organizationId, propertyId, unitId);
  if (!detail || detail.property.status !== "active" || detail.unit.status !== "active") return <MissingPropertyResource />;
  return (
    <UnitDetailView
      property={{ id: detail.property.id, name: detail.property.name, type: detail.property.type }}
      unit={detail.unit}
      canManage={authorization.capabilities.includes("unit.manage")}
      canManageLease={authorization.capabilities.includes("lease.manage")}
    />
  );
}
