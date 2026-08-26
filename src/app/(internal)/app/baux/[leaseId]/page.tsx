import { redirect } from "next/navigation";

export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  redirect(`/app/locations/${leaseId}`);
}
