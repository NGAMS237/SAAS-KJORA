import "server-only";

// =============================================================================
// KJORA — Contexte limité d'une Organization suspendue ou archivée (v3)
// =============================================================================
// Source unique : public.list_my_restricted_organizations() (REVENUE-01H,
// section 12). La RPC ne renvoie que les appartenances ACTIVES de l'appelant
// dans des Organizations 'suspended'/'archived', avec les droits restreints
// EFFECTIFS calculés en base (private.has_restricted_capability) — le client
// ne décide jamais s'il peut voir la facturation ou exporter.
//
// Jamais exposé : le motif interne (status_reason), une note Admin, l'auteur
// ou la date d'une action Admin.
// =============================================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isInternalRole, type InternalRole } from "@/core/authorization/capabilities";

export type RestrictedOrganizationStatus = "suspended" | "archived";

export type RestrictedOrganization = {
  id: string;
  name: string;
  status: RestrictedOrganizationStatus;
  role: InternalRole;
  /** Exception étroite : lecture de la facturation (Organization suspendue seulement). */
  canViewBilling: boolean;
  /** Exception étroite : export lecture seule (Owner actif d'une Organization suspendue seulement). */
  canExport: boolean;
};

function isRestrictedStatus(value: unknown): value is RestrictedOrganizationStatus {
  return value === "suspended" || value === "archived";
}

/** Organizations suspendues/archivées de l'utilisateur courant. Vide en cas d'erreur (fail-closed). */
export async function listMyRestrictedOrganizations(): Promise<RestrictedOrganization[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_restricted_organizations");
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).flatMap((row) => {
    const role = String(row.role ?? "");
    if (!isRestrictedStatus(row.organization_status) || !isInternalRole(role)) return [];
    return [{
      id: String(row.organization_id ?? ""),
      name: String(row.organization_name ?? ""),
      status: row.organization_status,
      role,
      canViewBilling: row.can_view_billing === true,
      canExport: row.can_export === true,
    }];
  });
}

/**
 * Résout UNE Organization restreinte de l'utilisateur à partir d'un
 * identifiant demandé (paramètre d'URL ou de formulaire). L'identifiant n'est
 * JAMAIS une autorisation : il n'est retenu que s'il figure dans la liste
 * calculée en base pour l'appelant.
 */
export async function resolveMyRestrictedOrganization(
  requestedId: string | null | undefined,
): Promise<{ organizations: RestrictedOrganization[]; selected: RestrictedOrganization | null }> {
  const organizations = await listMyRestrictedOrganizations();
  const selected = (requestedId ? organizations.find((o) => o.id === requestedId) : undefined)
    ?? organizations[0]
    ?? null;
  return { organizations, selected };
}
