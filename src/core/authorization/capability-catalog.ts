import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Capability, InternalRole } from "@/core/authorization/capabilities";
import { CapabilityCatalogCache, type Catalog, type RoleCapabilityRow } from "@/core/authorization/capability-catalog-cache";

// =============================================================================
// AFRICA-CONTRACTS-PERFORMANCE-01 — AXE C
// =============================================================================
// `public.role_capabilities` est un catalogue STATIQUE : (rôle, capacité) ne
// dépend d'AUCUNE Organization, d'AUCUN utilisateur. Vérifié dans le dépôt :
// les seules écritures de cette table sont des `insert` situés dans des
// migrations (jamais une mutation applicative à l'exécution — aucune console
// Admin ne permet de la modifier). La mettre en cache en mémoire de
// processus ne peut donc jamais mélanger des Organizations, des utilisateurs
// ou des rôles entre eux : son contenu est, par construction, identique pour
// tout le monde à un instant donné.
//
// Avant ce module, `getActiveAuthorization()` (appelée depuis CHAQUE page de
// `/app/*`, à CHAQUE navigation — les pages dynamiques ne sont pas mises en
// cache côté client, cf. rapport de performance) et `loadOrganizationContext()`
// (appelée à chaque montage du layout `/app`) exécutaient CHACUNE leur propre
// requête `role_capabilities` — une table de 79 lignes, aussi coûteuse à lire
// une fois que 79 fois. Mesuré en local (EXPLAIN ANALYZE, Postgres 16,
// `role_capabilities_pkey`) : ~0,06 ms d'exécution SQL par appel — la donnée
// elle-même n'est pas le problème, c'est l'aller-retour réseau (Supabase
// REST) qui l'est. Ce cache retire cet aller-retour de la quasi-totalité des
// navigations internes.
//
// Portée : en environnement serverless (Vercel), ce cache vit dans le
// processus d'une instance de fonction ; il n'est pas partagé entre
// instances et disparaît à chaque cold start. C'est un gain moyen, pas une
// garantie — sans risque, puisque la donnée mise en cache n'est jamais
// sensible ni propre à une Organization. Le cœur pur, testable sans base ni
// réseau, vit dans capability-catalog-cache.ts.

async function fetchFromSupabase(): Promise<RoleCapabilityRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("role_capabilities").select("role, capability");
  if (error) throw error;
  return (data ?? []) as RoleCapabilityRow[];
}

const processCache = new CapabilityCatalogCache(fetchFromSupabase);

/** Capacités d'UN rôle (utilisé par `getActiveAuthorization`). */
export async function getCapabilitiesForRole(role: InternalRole): Promise<Capability[]> {
  return processCache.getCapabilitiesForRole(role);
}

/** Capacités de PLUSIEURS rôles à la fois (utilisé par `loadOrganizationContext`). */
export async function getCapabilitiesForRoles(roles: InternalRole[]): Promise<Catalog> {
  return processCache.getCapabilitiesForRoles(roles);
}

/** Test uniquement : force un prochain appel à relire la base. */
export function __resetCapabilityCatalogForTests() {
  processCache.reset();
}
