import { isCapability, isInternalRole, type Capability, type InternalRole } from "./capabilities.ts";

// =============================================================================
// AFRICA-CONTRACTS-PERFORMANCE-01 — AXE C
// =============================================================================
// Cœur PUR (aucune dépendance à `cookies()`/Supabase/Next) du cache du
// catalogue `role_capabilities`. Voir capability-catalog.ts pour le contexte
// complet et le repli serveur qui l'instancie avec le vrai client Supabase.
//
// `role_capabilities` est un catalogue STATIQUE (rôle, capacité) : aucune
// dépendance à une Organization ni à un utilisateur, jamais modifié par
// l'application à l'exécution (seules des migrations y insèrent des lignes).
// Le mettre en cache en mémoire de processus ne peut donc jamais mélanger
// des Organizations, des utilisateurs ou des rôles entre eux.
//
// Garanties de ce cache :
//   - un seul appel à `fetcher` par fenêtre TTL (relu après expiration) ;
//   - des appels concurrents pendant un rafraîchissement partagent le MÊME
//     appel en vol (pas de rafale de requêtes identiques en parallèle).
export const CATALOG_TTL_MS = 5 * 60 * 1000;

export type RoleCapabilityRow = { role: string; capability: string };
export type Catalog = Map<InternalRole, Capability[]>;

function buildCatalog(rows: RoleCapabilityRow[]): Catalog {
  const byRole: Catalog = new Map();
  for (const row of rows) {
    if (!isInternalRole(row.role) || !isCapability(row.capability)) continue;
    byRole.set(row.role, [...(byRole.get(row.role) ?? []), row.capability]);
  }
  return byRole;
}

export class CapabilityCatalogCache {
  #fetcher: () => Promise<RoleCapabilityRow[]>;
  #ttlMs: number;
  #now: () => number;
  #cached: { byRole: Catalog; fetchedAt: number } | null = null;
  #inflight: Promise<Catalog> | null = null;
  #fetchCount = 0;

  constructor(fetcher: () => Promise<RoleCapabilityRow[]>, options?: { ttlMs?: number; now?: () => number }) {
    this.#fetcher = fetcher;
    this.#ttlMs = options?.ttlMs ?? CATALOG_TTL_MS;
    this.#now = options?.now ?? Date.now;
  }

  /** Nombre réel d'appels à `fetcher` effectués depuis la création — pour les tests. */
  get fetchCount(): number {
    return this.#fetchCount;
  }

  async getCatalog(): Promise<Catalog> {
    const now = this.#now();
    if (this.#cached && now - this.#cached.fetchedAt < this.#ttlMs) return this.#cached.byRole;
    if (!this.#inflight) {
      this.#inflight = (async () => {
        this.#fetchCount += 1;
        const rows = await this.#fetcher();
        const byRole = buildCatalog(rows);
        this.#cached = { byRole, fetchedAt: this.#now() };
        return byRole;
      })().finally(() => {
        this.#inflight = null;
      });
    }
    return this.#inflight;
  }

  async getCapabilitiesForRole(role: InternalRole): Promise<Capability[]> {
    const catalog = await this.getCatalog();
    return catalog.get(role) ?? [];
  }

  async getCapabilitiesForRoles(roles: InternalRole[]): Promise<Catalog> {
    const catalog = await this.getCatalog();
    const result: Catalog = new Map();
    for (const role of roles) result.set(role, catalog.get(role) ?? []);
    return result;
  }

  /** Force le prochain appel à relire la source — tests uniquement. */
  reset() {
    this.#cached = null;
    this.#inflight = null;
  }
}
