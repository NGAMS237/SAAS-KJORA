import "server-only";

// =============================================================================
// KJORA — ADMIN-01 — Autorisation plateforme
// =============================================================================
// Autorité TRANSVERSE, volontairement disjointe du modèle par Organization.
//
//   • être platform_admin ne confère AUCUN droit dans une Organization ;
//   • être Organization Owner ne confère AUCUN droit plateforme ;
//   • aucun rôle interne (manager, collector, caretaker, accountant, viewer)
//     n'ouvre l'accès à la console.
//
// Le navigateur ne décide jamais : aucun paramètre d'URL, en-tête, cookie ou
// champ de formulaire n'entre dans la décision. Le seul fait retenu est la
// présence d'une ligne dans public.platform_admins pour l'utilisateur de la
// session Supabase courante, évaluée côté serveur.
//
// Défaut = refus. Toute erreur, session absente ou réponse inattendue est
// traitée comme un refus, jamais comme une autorisation.
// =============================================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformAdminDecision =
  /** Aucune session Supabase valide. */
  | { allowed: false; reason: "unauthenticated" }
  /** Session valide, mais l'utilisateur n'est pas administrateur plateforme. */
  | { allowed: false; reason: "not_platform_admin" }
  /** La vérification n'a pas abouti (base injoignable, RPC absente…). */
  | { allowed: false; reason: "check_failed" }
  /**
   * Administrateur plateforme confirmé.
   *
   * `userEmail` vient du même claim JWT déjà lu ailleurs dans l'application
   * (voir src/core/auth/require-user.ts) — aucun appel réseau supplémentaire.
   * Null si le claim est absent : l'en-tête de la console l'affiche alors sans
   * planter, jamais avec une valeur inventée.
   */
  | { allowed: true; userId: string; userEmail: string | null };

/**
 * Évalue l'autorisation plateforme de l'utilisateur courant.
 *
 * Ne lève jamais : renvoie toujours une décision explicite, pour que l'appelant
 * choisisse la réponse HTTP appropriée. Un échec de vérification est un refus.
 */
export async function resolvePlatformAdmin(): Promise<PlatformAdminDecision> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { allowed: false, reason: "check_failed" };
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { allowed: false, reason: "unauthenticated" };
  }
  const claimedEmail = claimsData?.claims?.email;
  const userEmail = typeof claimedEmail === "string" ? claimedEmail : null;

  // La RPC est SECURITY DEFINER et lit platform_admins, dont la RLS interdit la
  // lecture aux non-admins. Sans SECURITY DEFINER, le prédicat renverrait faux
  // pour l'utilisateur qu'il doit précisément autoriser.
  const { data, error } = await supabase.rpc("is_platform_admin_self");

  if (error) {
    return { allowed: false, reason: "check_failed" };
  }
  // Comparaison stricte : seul `true` autorise. `null`, `undefined`, une chaîne
  // ou tout autre valeur sont des refus.
  if (data !== true) {
    return { allowed: false, reason: "not_platform_admin" };
  }

  return { allowed: true, userId, userEmail };
}

/**
 * Variante booléenne, pour les appels qui n'ont pas besoin du motif.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  return (await resolvePlatformAdmin()).allowed;
}
