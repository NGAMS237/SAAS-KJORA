import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LeaseCoTenant = { id: string; tenantId: string; fullName: string };

// Tant que la migration 20261103120000_lease_co_tenants n'est pas appliquée,
// la table n'existe pas : on répond « aucun colocataire » au lieu de casser la page.
function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /lease_co_tenants/.test(error.message ?? "") && /does not exist|schema cache/.test(error.message ?? "");
}

export async function listLeaseCoTenants(organizationId: string, leaseId: string): Promise<{ available: boolean; items: LeaseCoTenant[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lease_co_tenants")
    .select("id, tenant_id")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    if (isMissingTable(error)) return { available: false, items: [] };
    throw error;
  }
  const rows = data ?? [];
  if (rows.length === 0) return { available: true, items: [] };
  const tenants = await supabase.from("tenants").select("id, full_name").eq("organization_id", organizationId).in("id", rows.map((row) => row.tenant_id));
  if (tenants.error) throw tenants.error;
  const names = new Map((tenants.data ?? []).map((row) => [row.id, row.full_name as string]));
  return { available: true, items: rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, fullName: names.get(row.tenant_id) ?? "—" })) };
}
