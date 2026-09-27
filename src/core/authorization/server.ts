import "server-only";

import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import {
  isCapability,
  isInternalRole,
  type Capability,
  type InternalRole,
} from "@/core/authorization/capabilities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActiveAuthorization = {
  organizationId: string;
  role: InternalRole;
  capabilities: Capability[];
  userId: string;
};

export async function getActiveAuthorization(): Promise<ActiveAuthorization | null> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return null;

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  let membershipQuery = supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active");
  if (requestedOrganizationId) {
    membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId);
  }
  const { data: memberships, error: membershipError } = await membershipQuery.limit(1);
  const membership = memberships?.[0];
  if (membershipError || !membership || !isInternalRole(membership.role)) return null;

  const { data: capabilityRows, error: capabilityError } = await supabase
    .from("role_capabilities")
    .select("capability")
    .eq("role", membership.role);
  if (capabilityError) return null;
  const capabilities = (capabilityRows ?? [])
    .map((row) => row.capability)
    .filter(isCapability);

  return {
    organizationId: membership.organization_id,
    role: membership.role,
    capabilities,
    userId,
  };
}

// ALIGN-03 — Capacités qui restent accessibles lorsque la facturation est bloquée.
// Un compte suspendu doit pouvoir consulter son espace, régler son abonnement,
// gérer son compte et demander de l'aide. Tout le reste devient lecture seule.
const CAPABILITIES_ALLOWED_WHEN_BLOCKED: readonly Capability[] = [
  "organization.view",
  "organization.profile.manage",
  "billing.view",
  "billing.manage",
  // EXPORT-01 — lecture seule, jamais une mutation : un compte bloqué doit
  // pouvoir récupérer ses propres données (portabilité), comme il peut déjà
  // consulter son espace en lecture intégrale (ALIGN-03).
  "data_export.manage",
];

/** Une capacité entraîne-t-elle une mutation métier ? */
function isMutatingCapability(capability: Capability): boolean {
  if (CAPABILITIES_ALLOWED_WHEN_BLOCKED.includes(capability)) return false;
  return capability.endsWith(".manage")
    || capability.endsWith(".record")
    || capability.endsWith(".correct")
    || capability.endsWith(".share");
}

export async function isOrganizationBillingBlocked(organizationId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_billing_blocked", {
    target_organization_id: organizationId,
  });
  // En cas d'erreur, ne pas bloquer : le verrou base reste la barrière ultime.
  if (error) return false;
  return data === true;
}

// REVENUE-01H — une Organization suspendue ou archivée par un Admin
// (public.organizations.status) perd tout accès aux capacités métier,
// lecture comme écriture. Volontairement DIFFÉRENT du blocage facturation
// ALIGN-03 ci-dessus : celui-ci laisse délibérément `billing.*` accessible
// pour permettre à l'Organization de régulariser elle-même sa situation ; une
// suspension Admin est un gel décidé par la plateforme (abus, litige…), donc
// n'accorde aucune exception — y compris pour la facturation. La colonne
// `status` est déjà lisible par `authenticated` (lot_5b) : aucun nouveau
// grant n'est nécessaire ici.
export async function isOrganizationActive(organizationId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", organizationId)
    .maybeSingle();
  // En cas d'erreur, ne pas bloquer : private.has_capability (base, REVENUE-01H)
  // reste la barrière ultime, comme pour isOrganizationBillingBlocked ci-dessus.
  if (error || !data) return true;
  return data.status === "active";
}

export async function requireActiveCapability(requested: Capability) {
  const authorization = await getActiveAuthorization();
  if (!authorization) return { authorization: null, status: 401 as const };
  if (!authorization.capabilities.includes(requested)) {
    return { authorization: null, status: 403 as const };
  }

  // REVENUE-01H — barrière applicative, avant même le blocage facturation :
  // une Organization suspendue/archivée n'a plus aucune capacité, quelle que
  // soit sa situation de facturation. La barrière ultime, incontournable,
  // reste private.has_capability en base (même un appel REST direct au RPC
  // est refusé).
  if (!(await isOrganizationActive(authorization.organizationId))) {
    return { authorization: null, status: 403 as const };
  }

  // ALIGN-03 — première barrière, côté serveur. La seconde, incontournable,
  // est le trigger `billing_blocked_insert_guard` posé en base : même un appel
  // REST direct au RPC est refusé.
  if (isMutatingCapability(requested)
    && await isOrganizationBillingBlocked(authorization.organizationId)) {
    return { authorization: null, status: 402 as const };
  }

  return { authorization, status: 200 as const };
}
