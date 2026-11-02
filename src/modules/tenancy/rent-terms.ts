import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ScheduledRentTerms = { id: string; effectiveFrom: string; baseRentXaf: number; recurringChargesXaf: number };

// Changements de loyer déjà programmés pour une location (dates à venir).
export async function listScheduledRentTerms(organizationId: string, leaseId: string): Promise<ScheduledRentTerms[]> {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("lease_financial_terms")
    .select("id, effective_from, base_rent_xaf, recurring_charges_xaf")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .gt("effective_from", today)
    .order("effective_from", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, effectiveFrom: row.effective_from, baseRentXaf: Number(row.base_rent_xaf), recurringChargesXaf: Number(row.recurring_charges_xaf) }));
}
