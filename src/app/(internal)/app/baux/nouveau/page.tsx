import { LeaseCreateExperience } from "@/modules/rental-demo/views";
export default async function NewLeasePage({ searchParams }: { searchParams: Promise<{ tenant?: string; unit?: string }> }) { const { tenant, unit } = await searchParams; return <LeaseCreateExperience initialTenantId={tenant} initialUnitId={unit} />; }
