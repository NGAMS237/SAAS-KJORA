import { getActiveAuthorization } from "@/core/authorization/server";
import { MissingTenancyResource, TenantCreateForm } from "@/modules/tenancy/views";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewTenantPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("tenant.manage")) return <MissingTenancyResource />;
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("organization_profiles")
    .select("country_code")
    .eq("organization_id", authorization.organizationId)
    .maybeSingle();
  return <TenantCreateForm organizationCountry={profile?.country_code ?? "CM"} />;
}
