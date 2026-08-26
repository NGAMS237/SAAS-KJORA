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

export async function requireActiveCapability(requested: Capability) {
  const authorization = await getActiveAuthorization();
  if (!authorization) return { authorization: null, status: 401 as const };
  if (!authorization.capabilities.includes(requested)) {
    return { authorization: null, status: 403 as const };
  }
  return { authorization, status: 200 as const };
}
