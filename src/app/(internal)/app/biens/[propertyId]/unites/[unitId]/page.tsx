import { UnitDetailExperience } from "@/modules/rental-demo/views";
export default async function UnitPage({ params }: { params: Promise<{ propertyId: string; unitId: string }> }) { const { propertyId, unitId } = await params; return <UnitDetailExperience propertyId={propertyId} unitId={unitId} />; }
