import { PropertyDetailExperience } from "@/modules/rental-demo/views";
export default async function PropertyPage({ params }: { params: Promise<{ propertyId: string }> }) { const { propertyId } = await params; return <PropertyDetailExperience propertyId={propertyId} />; }
