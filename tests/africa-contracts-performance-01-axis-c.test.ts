// =============================================================================
// AFRICA-CONTRACTS-PERFORMANCE-01 — AXE C (performance de navigation)
// =============================================================================
// Tests du cœur PUR du cache du catalogue `role_capabilities` : aucune base,
// aucun réseau. Garantit que la donnée mise en cache (identique pour tout le
// monde, jamais propre à une Organization) est bien dédoublonnée sans jamais
// pouvoir mélanger des rôles entre eux.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CapabilityCatalogCache, type RoleCapabilityRow } from "../src/core/authorization/capability-catalog-cache.ts";

const ROWS: RoleCapabilityRow[] = [
  { role: "organization_owner", capability: "organization.view" },
  { role: "organization_owner", capability: "billing.manage" },
  { role: "manager", capability: "organization.view" },
  { role: "viewer", capability: "organization.view" },
  // Lignes invalides — doivent être ignorées silencieusement, jamais lever.
  { role: "not_a_role", capability: "organization.view" },
  { role: "manager", capability: "not_a_capability" },
];

function counterFetcher(rows: RoleCapabilityRow[] = ROWS) {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return rows;
  };
  return { fetcher, callCount: () => calls };
}

test("AXE C — un seul appel réseau pour plusieurs lectures dans la fenêtre TTL", async () => {
  const { fetcher, callCount } = counterFetcher();
  const cache = new CapabilityCatalogCache(fetcher, { ttlMs: 1000, now: () => 0 });
  const first = await cache.getCapabilitiesForRole("organization_owner");
  const second = await cache.getCapabilitiesForRole("organization_owner");
  const third = await cache.getCapabilitiesForRoles(["manager", "viewer"]);
  assert.deepEqual(first.sort(), ["billing.manage", "organization.view"]);
  assert.deepEqual(second.sort(), ["billing.manage", "organization.view"]);
  assert.deepEqual(third.get("manager"), ["organization.view"]);
  assert.deepEqual(third.get("viewer"), ["organization.view"]);
  assert.equal(callCount(), 1, "role_capabilities ne doit être lu qu'une seule fois dans la fenêtre TTL");
  assert.equal(cache.fetchCount, 1);
});

test("AXE C — les lignes invalides (rôle ou capacité inconnus) n'apparaissent jamais et ne font pas planter la lecture", async () => {
  const { fetcher } = counterFetcher();
  const cache = new CapabilityCatalogCache(fetcher, { now: () => 0 });
  const manager = await cache.getCapabilitiesForRole("manager");
  // "not_a_capability" est filtrée ; seule "organization.view" doit rester.
  assert.deepEqual(manager, ["organization.view"]);
  const nobody = await cache.getCapabilitiesForRole("collector");
  assert.deepEqual(nobody, [], "un rôle sans ligne dans le catalogue renvoie un tableau vide, jamais une erreur");
});

test("AXE C — un seul appel réseau pour des lectures concurrentes pendant le premier chargement", async () => {
  let calls = 0;
  let resolveFetch: (rows: RoleCapabilityRow[]) => void = () => {};
  const fetcher = () =>
    new Promise<RoleCapabilityRow[]>((resolve) => {
      calls += 1;
      resolveFetch = resolve;
    });
  const cache = new CapabilityCatalogCache(fetcher, { now: () => 0 });
  const p1 = cache.getCapabilitiesForRole("organization_owner");
  const p2 = cache.getCapabilitiesForRole("manager");
  const p3 = cache.getCapabilitiesForRoles(["viewer"]);
  // Les trois lectures sont parties AVANT que le fetch ne réponde : elles
  // doivent partager le même appel en vol, pas en déclencher un chacune.
  assert.equal(calls, 1, "des lectures concurrentes pendant un rafraîchissement ne doivent déclencher qu'un seul fetch");
  resolveFetch(ROWS);
  const [owner, manager, viewerMap] = await Promise.all([p1, p2, p3]);
  assert.deepEqual(owner.sort(), ["billing.manage", "organization.view"]);
  assert.deepEqual(manager, ["organization.view"]);
  assert.deepEqual(viewerMap.get("viewer"), ["organization.view"]);
});

test("AXE C — le catalogue est relu après expiration du TTL (jamais indéfiniment périmé)", async () => {
  const { fetcher, callCount } = counterFetcher();
  let now = 0;
  const cache = new CapabilityCatalogCache(fetcher, { ttlMs: 1000, now: () => now });
  await cache.getCapabilitiesForRole("organization_owner");
  assert.equal(callCount(), 1);
  now = 500;
  await cache.getCapabilitiesForRole("organization_owner");
  assert.equal(callCount(), 1, "toujours dans la fenêtre TTL : pas de second appel");
  now = 1500;
  await cache.getCapabilitiesForRole("organization_owner");
  assert.equal(callCount(), 2, "TTL expiré : le catalogue doit être relu, jamais resservi indéfiniment");
});

test("AXE C — reset() force une relecture immédiate (utilisé par les tests d'intégration)", async () => {
  const { fetcher, callCount } = counterFetcher();
  const cache = new CapabilityCatalogCache(fetcher, { now: () => 0 });
  await cache.getCapabilitiesForRole("organization_owner");
  assert.equal(callCount(), 1);
  cache.reset();
  await cache.getCapabilitiesForRole("organization_owner");
  assert.equal(callCount(), 2);
});

test("AXE C — deux instances de cache (deux rôles jamais mélangés) restent indépendantes", async () => {
  // Un cache est un objet en mémoire, jamais partagé entre deux catalogues
  // différents : deux instances avec des données différentes ne peuvent pas
  // se contaminer (propriété structurelle qui interdit tout mélange entre
  // Organizations/utilisateurs/rôles, même si le catalogue changeait un jour).
  const cacheA = new CapabilityCatalogCache(async () => [{ role: "viewer", capability: "organization.view" }], { now: () => 0 });
  const cacheB = new CapabilityCatalogCache(async () => [{ role: "viewer", capability: "billing.view" }], { now: () => 0 });
  const a = await cacheA.getCapabilitiesForRole("viewer");
  const b = await cacheB.getCapabilitiesForRole("viewer");
  assert.deepEqual(a, ["organization.view"]);
  assert.deepEqual(b, ["billing.view"]);
});
