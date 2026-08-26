import { cookies } from "next/headers";
import { requireUser } from "@/core/auth/require-user";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganization,
  type OrganizationOption,
} from "@/core/organization/select-active-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembershipRow = { organization_id: string; role: string };
type OrganizationRow = { id: string };
type ProfileRow = {
  organization_id: string;
  name: string;
  country_code: string;
  currency_code: string;
  language: "fr" | "en";
  timezone: string;
};

export async function loadOrganizationContext() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: membershipData, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (membershipError) throw membershipError;

  const memberships = (membershipData ?? []) as MembershipRow[];
  if (memberships.length === 0) return { user, organizations: [], activeOrganization: null };

  const membershipByOrganization = new Map(memberships.map((row) => [row.organization_id, row.role]));
  const ids = [...membershipByOrganization.keys()];
  const [{ data: organizationData, error: organizationError }, { data: profileData, error: profileError }] =
    await Promise.all([
      supabase.from("organizations").select("id").eq("status", "active").in("id", ids),
      supabase
        .from("organization_profiles")
        .select("organization_id, name, country_code, currency_code, language, timezone")
        .in("organization_id", ids),
    ]);
  if (organizationError) throw organizationError;
  if (profileError) throw profileError;

  const activeIds = new Set(((organizationData ?? []) as OrganizationRow[]).map((row) => row.id));
  const organizations: OrganizationOption[] = ((profileData ?? []) as ProfileRow[])
    .filter((profile) => activeIds.has(profile.organization_id))
    .map((profile) => ({
      id: profile.organization_id,
      name: profile.name,
      role: membershipByOrganization.get(profile.organization_id) ?? "",
      countryCode: profile.country_code,
      currencyCode: profile.currency_code,
      language: profile.language,
      timezone: profile.timezone,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));

  const cookieStore = await cookies();
  const activeOrganization = selectActiveOrganization(
    organizations,
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
  return { user, organizations, activeOrganization };
}
