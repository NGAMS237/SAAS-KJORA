// =============================================================================
// KJORA — ADMIN-01 — Analyse pure des réponses paginées
// =============================================================================
// Volontairement séparé de server.ts (qui importe "server-only" et le client
// Supabase) : ce module n'a aucune dépendance à Next.js ni à une session, et
// reste donc testable directement par `node --test`, comme monitoring.ts.
//
// Contexte du correctif — pagination au-delà de la dernière ligne :
// les RPC `admin_list_organizations` et `admin_list_subscriptions` renvoyaient
// auparavant un jeu de lignes (`returns table (...)`) où chaque ligne portait
// sa propre copie de `total_count`. Avec un offset dépassant la dernière ligne
// existante, la requête ne renvoie AUCUNE ligne — et donc aucun porteur pour
// total_count, que l'appelant lisait alors comme 0 (`raw[0]?.total_count`),
// alors que la base contenait bel et bien des données.
//
// Les RPC renvoient désormais un objet jsonb unique
// `{ rows, total_count, limit, offset }`, toujours présent même si `rows` est
// vide. `parsePagedPayload` en extrait un `Paginated<T>` fiable dans tous les
// cas, y compris une page vide au-delà de la dernière ligne.
// =============================================================================

export function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export type Paginated<T> = {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
};

export type PagedPayload = {
  rows?: unknown;
  total_count?: unknown;
  limit?: unknown;
  offset?: unknown;
};

/**
 * Transforme la réponse jsonb `{ rows, total_count, limit, offset }` d'une RPC
 * paginée en `Paginated<T>`. `total` provient TOUJOURS de `total_count`, jamais
 * du nombre de lignes réellement renvoyées : les deux sont délibérément
 * indépendants pour qu'une page vide (offset au-delà de la dernière ligne)
 * n'efface pas le total réel.
 */
export function parsePagedPayload<T>(
  data: unknown,
  mapRow: (row: Record<string, unknown>) => T,
  fallbackLimit: number,
  fallbackOffset: number,
): Paginated<T> {
  const payload = (data ?? {}) as PagedPayload;
  const raw = Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [];

  return {
    rows: raw.map(mapRow),
    total: toNumber(payload.total_count),
    limit: payload.limit !== undefined ? toNumber(payload.limit) : fallbackLimit,
    offset: payload.offset !== undefined ? toNumber(payload.offset) : fallbackOffset,
  };
}
