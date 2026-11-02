import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LeaseContractDates = { available: boolean; start: string | null; end: string | null };

// Tant que la migration 20261103140000_lease_contract_dates n'est pas appliquée,
// les colonnes n'existent pas : la carte masque l'édition au lieu de casser la page.
export async function getLeaseContractDates(organizationId: string, leaseId: string): Promise<LeaseContractDates> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("leases").select("contract_start_date, contract_end_date").eq("organization_id", organizationId).eq("id", leaseId).maybeSingle();
  if (error || !data) return { available: false, start: null, end: null };
  return { available: true, start: (data.contract_start_date as string | null) ?? null, end: (data.contract_end_date as string | null) ?? null };
}
