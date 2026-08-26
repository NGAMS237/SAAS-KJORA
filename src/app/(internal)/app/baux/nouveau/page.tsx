import { redirect } from "next/navigation";

export default async function NewLeasePage({ searchParams }: { searchParams: Promise<{ tenant?: string; unit?: string }> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.tenant) params.set("tenant", query.tenant);
  if (query.unit) params.set("unit", query.unit);
  redirect(`/app/locations/nouveau${params.size ? `?${params}` : ""}`);
}
