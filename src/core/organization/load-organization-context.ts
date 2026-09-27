import { cookies } from "next/headers";
import { requireUser } from "@/core/auth/require-user";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganization,
  type OrganizationOption,
} from "@/core/organization/select-active-organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCapability, isInternalRole, type Capability, type InternalRole } from "@/core/authorization/capabilities";

type MembershipRow = { organization_id: string; role: InternalRole };
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

  const memberships = (membershipData ?? []).filter(
    (row): row is MembershipRow => isInternalRole(row.role),
  );
  if (memberships.length === 0) return { user, organizations: [], activeOrganization: null };

  const membershipByOrganization = new Map(memberships.map((row) => [row.organization_id, row.role]));
  const ids = [...membershipByOrganization.keys()];
  const roles = [...new Set(memberships.map((membership) => membership.role))];
  const [
    { data: organizationData, error: organizationError },
    { data: profileData, error: profileError },
    { data: capabilityData, error: capabilityError },
  ] =
    await Promise.all([
      supabase.from("organizations").select("id").eq("status", "active").in("id", ids),
      supabase
        .from("organization_profiles")
        .select("organization_id, name, country_code, currency_code, language, timezone")
        .in("organization_id", ids),
      supabase.from("role_capabilities").select("role, capability").in("role", roles),
    ]);
  if (organizationError) throw organizationError;
  if (profileError) throw profileError;
  if (capabilityError) throw capabilityError;

  const capabilitiesByRole = new Map<InternalRole, Capability[]>();
  for (const row of capabilityData ?? []) {
    if (!isInternalRole(row.role) || !isCapability(row.capability)) continue;
    capabilitiesByRole.set(row.role, [...(capabilitiesByRole.get(row.role) ?? []), row.capability]);
  }

  const activeIds = new Set(((organizationData ?? []) as OrganizationRow[]).map((row) => row.id));
  const organizations: OrganizationOption[] = ((profileData ?? []) as ProfileRow[])
    .filter((profile) => activeIds.has(profile.organization_id))
    .flatMap((profile) => {
      const role = membershipByOrganization.get(profile.organization_id);
      if (!role) return [];
      return [{
        id: profile.organization_id,
        name: profile.name,
        role,
        capabilities: capabilitiesByRole.get(role) ?? [],
        countryCode: profile.country_code,
        currencyCode: profile.currency_code,
        language: profile.language,
        timezone: profile.timezone,
      }];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));

  const cookieStore = await cookies();
  const activeOrganization = selectActiveOrganization(
    organizations,
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
  return { user, organizations, activeOrganization };
}

/**
 * REVENUE-LAUNCH-01 — Complément (§5) : identité minimale + aide/support pour
 * une Organization suspendue ou archivée.
 *
 * `loadOrganizationContext()` filtre volontairement `organizations` sur
 * `status = 'active'` (ligne ci-dessus) : une Organization suspendue/archivée
 * n'y apparaît jamais, et `activeOrganization` devient `null` pour un membre
 * qui n'appartient qu'à celle-ci — c'est le comportement voulu pour TOUTE
 * fonctionnalité métier (property.*, tenant.*, lease.*, billing.*…), déjà
 * bloquée indépendamment au niveau RLS par `private.has_capability`
 * (REVENUE-01H, qui exige désormais `organizations.status = 'active'`).
 *
 * Mais le mandat exige explicitement qu'une Organization suspendue/archivée
 * conserve un accès en lecture à : son identité minimale, son statut, et
 * l'aide/support. Cette fonction sert exactement ce besoin, SANS toucher à
 * `loadOrganizationContext` (zéro risque de régression pour ses appelants
 * existants) : elle résout l'appartenance de l'utilisateur à UNE Organization
 * quel que soit son statut ('active', 'suspended' ou 'archived'), en ne
 * filtrant que sur `memberships.status = 'active'` (l'appartenance elle-même
 * doit être active — un membre désactivé, lui, n'a droit à rien).
 *
 * La RLS l'autorise déjà sans changement : "members can read their
 * organizations"/"...organization profiles" (lot_5b) utilisent
 * `private.is_active_member`, jamais `has_capability` — un membre actif
 * d'une Organization suspendue peut donc toujours lire `organizations.status`
 * et `organization_profiles.name`.
 */
export async function loadAnyMembershipOrganization(): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  organization: { id: string; name: string; status: string; role: InternalRole } | null;
}> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: membershipData, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (membershipError) throw membershipError;

  const memberships = (membershipData ?? []).filter(
    (row): row is MembershipRow => isInternalRole(row.role),
  );
  if (memberships.length === 0) return { user, organization: null };

  const membershipByOrganization = new Map(memberships.map((row) => [row.organization_id, row.role]));
  const ids = [...membershipByOrganization.keys()];

  // Aucun filtre de statut ici, contrairement à loadOrganizationContext : une
  // Organization suspendue/archivée doit être résolue, pas disparaître.
  const [
    { data: organizationData, error: organizationError },
    { data: profileData, error: profileError },
  ] = await Promise.all([
    supabase.from("organizations").select("id, status").in("id", ids),
    supabase.from("organization_profiles").select("organization_id, name").in("organization_id", ids),
  ]);
  if (organizationError) throw organizationError;
  if (profileError) throw profileError;

  const statusById = new Map(
    ((organizationData ?? []) as { id: string; status: string }[]).map((row) => [row.id, row.status]),
  );
  const nameById = new Map(
    ((profileData ?? []) as { organization_id: string; name: string }[]).map((row) => [
      row.organization_id,
      row.name,
    ]),
  );

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const selectedId = requestedId && membershipByOrganization.has(requestedId) ? requestedId : ids[0];
  const role = membershipByOrganization.get(selectedId);
  const status = statusById.get(selectedId);
  if (!role || !status) return { user, organization: null };

  return {
    user,
    organization: {
      id: selectedId,
      name: nameById.get(selectedId) ?? "",
      status,
      role,
    },
  };
}
