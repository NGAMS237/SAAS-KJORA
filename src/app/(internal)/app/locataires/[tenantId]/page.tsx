import { TenantDetailExperience } from "@/modules/rental-demo/views";
export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) { const { tenantId } = await params; return <TenantDetailExperience tenantId={tenantId} />; }
