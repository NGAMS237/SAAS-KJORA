import { LeaseDetailExperience } from "@/modules/rental-demo/views";
export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) { const { leaseId } = await params; return <LeaseDetailExperience leaseId={leaseId} />; }
