import "server-only";

// =============================================================================
// KJORA — Context resolver serveur (ALIGN-02)
// =============================================================================
// Règle architecturale : après authentification, le CONTEXTE RÉEL de
// l'utilisateur est déterminé exclusivement côté serveur, à partir de l'état
// base de données et des cookies d'invitation httpOnly.
//
// Le navigateur ne décide JAMAIS :
//   • de son rôle ;
//   • de l'Organization cible ;
//   • de son plan ;
//   • de sa destination.
//
// Aucun paramètre d'URL (role, org, organization_id, plan, admin…) n'entre dans
// la décision de routage. Seul `plan_requested` est lu, et uniquement comme
// intention d'onboarding — jamais comme droit.
// =============================================================================

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MEMBERSHIP_INVITATION_COOKIE } from "@/core/team/invitation-cookie";
import { TENANT_PORTAL_INVITATION_COOKIE } from "@/tenant-portal/invitation-cookie";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/core/organization/select-active-organization";
import { isInternalRole, type InternalRole } from "@/core/authorization/capabilities";
import {
  ONBOARDING_STEPS,
  type OnboardingState,
  type OnboardingStep,
  emptyOnboardingState,
  parseOnboardingState,
  nextOnboardingDestination,
} from "@/core/onboarding/onboarding-state";

// ---------------------------------------------------------------------------
// Types de contexte
// ---------------------------------------------------------------------------

export type OrganizationSummary = {
  id: string;
  name: string;
  role: InternalRole;
  status: "active" | "suspended";
};

export type ResolvedContext =
  /** Aucune session Supabase valide */
  | { kind: "unauthenticated" }
  /** Une invitation Membership est en attente — priorité absolue (§15) */
  | { kind: "membership_invitation_pending" }
  /** Une invitation portail locataire est en attente — priorité absolue (§15) */
  | { kind: "portal_invitation_pending" }
  /** Aucun Membership, aucune identité portail : nouveau propriétaire */
  | { kind: "no_organization"; onboarding: OnboardingState }
  /** Organization créée mais onboarding non terminé : reprise */
  | { kind: "onboarding_incomplete"; onboarding: OnboardingState; organizationId: string }
  /** Owner d'une seule Organization */
  | { kind: "owner_single_org"; organization: OrganizationSummary }
  /** Owner de plusieurs Organizations */
  | { kind: "owner_multi_org"; organizations: OrganizationSummary[]; lastActiveId: string | null }
  /** Membre non-owner (gestionnaire, encaisseur, gardien, comptable, consultation) */
  | { kind: "collaborator"; organizations: OrganizationSummary[]; lastActiveId: string | null }
  /** Identité locataire uniquement */
  | { kind: "tenant_only" }
  /** À la fois membre interne et locataire : sélecteur de contexte */
  | { kind: "owner_and_tenant"; organizations: OrganizationSummary[]; lastActiveId: string | null }
  /** Toutes les Organizations de l'utilisateur sont suspendues */
  | { kind: "organization_suspended" };

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

export const ROUTE_CONNEXION = "/connexion";
export const ROUTE_APP = "/app";
export const ROUTE_PORTAL = "/portal";
export const ROUTE_ONBOARDING = "/onboarding/organization";
export const ROUTE_MEMBERSHIP_INVITATION = "/invitation/accepter";
export const ROUTE_PORTAL_INVITATION = "/portal/invitation/accepter";
export const ROUTE_CONTEXT_SELECTOR = "/app";
export const ROUTE_SUSPENDED = "/connexion?reason=organization-suspended";

/**
 * Destination canonique pour un contexte résolu.
 * Pure : testable sans base de données.
 *
 * Note : `platform_admin` et les états billing (grace / blocked) sont documentés
 * dans le contrat d'intégration mais ne sont pas implémentés — ni la table
 * d'administration plateforme ni le domaine Billing n'existent à ce jour.
 * Aucune route fantôme n'est créée ici.
 */
export function destinationFor(context: ResolvedContext): string {
  switch (context.kind) {
    case "unauthenticated":
      return ROUTE_CONNEXION;
    case "membership_invitation_pending":
      return ROUTE_MEMBERSHIP_INVITATION;
    case "portal_invitation_pending":
      return ROUTE_PORTAL_INVITATION;
    case "no_organization":
      return ROUTE_ONBOARDING;
    case "onboarding_incomplete":
      return nextOnboardingDestination(context.onboarding);
    case "owner_single_org":
    case "owner_multi_org":
    case "collaborator":
    case "owner_and_tenant":
      return ROUTE_APP;
    case "tenant_only":
      return ROUTE_PORTAL;
    case "organization_suspended":
      return ROUTE_SUSPENDED;
  }
}

// ---------------------------------------------------------------------------
// Résolution
// ---------------------------------------------------------------------------

type MembershipRow = { organization_id: string; role: string; status: string };
type OrganizationRow = { id: string; status: string };
type ProfileRow = { organization_id: string; name: string };

/**
 * Résout le contexte réel de l'utilisateur courant.
 *
 * Ordre d'évaluation (les invitations priment sur la création d'Organization,
 * conformément au §15 : ne jamais créer une Organization inutile quand une
 * invitation doit être traitée) :
 *
 *   1. session absente        → unauthenticated
 *   2. invitation Membership  → membership_invitation_pending
 *   3. invitation portail     → portal_invitation_pending
 *   4. memberships actifs ?
 *        non → identité portail ? → tenant_only
 *                                 → no_organization
 *        oui → toutes suspendues ? → organization_suspended
 *              onboarding inachevé ? → onboarding_incomplete
 *              + identité portail ?  → owner_and_tenant
 *              owner unique / multi / collaborateur
 */
export async function resolveUserContext(): Promise<ResolvedContext> {
  const supabase = await createSupabaseServerClient();

  // 1. Session
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { kind: "unauthenticated" };
  }

  const cookieStore = await cookies();

  // 2 & 3. Invitations en attente — priorité absolue sur toute création
  if (cookieStore.get(MEMBERSHIP_INVITATION_COOKIE)?.value) {
    return { kind: "membership_invitation_pending" };
  }
  if (cookieStore.get(TENANT_PORTAL_INVITATION_COOKIE)?.value) {
    return { kind: "portal_invitation_pending" };
  }

  // 4. Memberships internes actifs
  const { data: membershipData } = await supabase
    .from("memberships")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");

  const memberships = ((membershipData ?? []) as MembershipRow[]).filter((row) =>
    isInternalRole(row.role),
  );

  // Identité portail (lue une seule fois, réutilisée)
  const portalResult = await supabase.rpc("has_tenant_portal_identity");
  const hasPortalIdentity = !portalResult.error && portalResult.data === true;

  if (memberships.length === 0) {
    if (hasPortalIdentity) return { kind: "tenant_only" };
    const onboarding = await loadOnboardingState(supabase);
    return { kind: "no_organization", onboarding };
  }

  // Organizations correspondantes + statut
  const ids = memberships.map((m) => m.organization_id);
  const [{ data: organizationData }, { data: profileData }] = await Promise.all([
    supabase.from("organizations").select("id, status").in("id", ids),
    supabase.from("organization_profiles").select("organization_id, name").in("organization_id", ids),
  ]);

  const statusById = new Map(
    ((organizationData ?? []) as OrganizationRow[]).map((row) => [row.id, row.status]),
  );
  const nameById = new Map(
    ((profileData ?? []) as ProfileRow[]).map((row) => [row.organization_id, row.name]),
  );

  const organizations: OrganizationSummary[] = memberships
    .filter((m) => statusById.get(m.organization_id) === "active")
    .map((m) => ({
      id: m.organization_id,
      name: nameById.get(m.organization_id) ?? "",
      role: m.role as InternalRole,
      status: "active" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // Toutes les Organizations sont suspendues
  if (organizations.length === 0) {
    if (hasPortalIdentity) return { kind: "tenant_only" };
    return { kind: "organization_suspended" };
  }

  // Onboarding inachevé sur l'Organization créée
  const onboarding = await loadOnboardingState(supabase);
  if (
    onboarding.organizationId &&
    onboarding.step !== "completed" &&
    organizations.some((o) => o.id === onboarding.organizationId)
  ) {
    return {
      kind: "onboarding_incomplete",
      onboarding,
      organizationId: onboarding.organizationId,
    };
  }

  const lastActiveRaw = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
  const lastActiveId = organizations.some((o) => o.id === lastActiveRaw) ? lastActiveRaw : null;

  if (hasPortalIdentity) {
    return { kind: "owner_and_tenant", organizations, lastActiveId };
  }

  const owned = organizations.filter((o) => o.role === "organization_owner");

  if (owned.length === 0) {
    return { kind: "collaborator", organizations, lastActiveId };
  }
  if (organizations.length === 1) {
    return { kind: "owner_single_org", organization: organizations[0] };
  }
  return { kind: "owner_multi_org", organizations, lastActiveId };
}

// ---------------------------------------------------------------------------
// Lecture de l'état d'onboarding
// ---------------------------------------------------------------------------

type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadOnboardingState(supabase: SupabaseLike): Promise<OnboardingState> {
  const { data, error } = await supabase.rpc("get_onboarding_state");
  if (error || !data) return emptyOnboardingState();
  return parseOnboardingState(data);
}

export { ONBOARDING_STEPS };
export type { OnboardingState, OnboardingStep };
