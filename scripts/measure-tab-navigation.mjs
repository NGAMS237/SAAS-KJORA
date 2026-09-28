// CONTRATS-UX-PILOTE-01 — mesure honnête de la navigation entre onglets,
// froide (premier accès après appli au repos) et chaude (onglets suivants
// dans la fenêtre TTL de 5 minutes), AVANT/APRÈS le correctif AXE C
// (cache in-process du catalogue role_capabilities + Promise.all des 3
// appels indépendants du layout).
//
// Ce script tourne dans CE bac à sable (pas Vercel/Supabase réel) : la
// latence réseau est SIMULÉE par un délai artificiel appliqué au fetcher,
// choisi pour être un ordre de grandeur plausible d'un aller-retour
// PostgREST/Supabase depuis un edge function Vercel (60 ms), documenté
// comme tel — jamais présenté comme une mesure de production réelle.
// Ce que ce script mesure réellement et honnêtement : le nombre d'allers-
// retours réseau simulés par navigation, avant et après le correctif, et le
// temps de traversée du CODE applicatif (cache + parallélisation) autour de
// ce délai simulé.
//
// Exécution : node scripts/measure-tab-navigation.mjs
import { CapabilityCatalogCache } from "../src/core/authorization/capability-catalog-cache.ts";

const SIMULATED_NETWORK_ROUND_TRIP_MS = 60;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulatedFetch(rows) {
  await delay(SIMULATED_NETWORK_ROUND_TRIP_MS);
  return rows;
}

const ROWS = [
  { role: "organization_owner", capability: "lease.manage" },
  { role: "organization_owner", capability: "contract.manage" },
  { role: "manager", capability: "lease.manage" },
];

async function measureBefore(navigations) {
  // AVANT le correctif : chaque navigation refait 2 appels réseau
  // (getActiveAuthorization + loadOrganizationContext interrogeaient
  // role_capabilities séparément, sans cache), et les 3 appels du layout
  // partagé (notifications, dashboard, organisations restreintes) étaient
  // enchaînés en série plutôt qu'en parallèle.
  const timings = [];
  for (let index = 0; index < navigations; index += 1) {
    const start = performance.now();
    await simulatedFetch(ROWS); // getActiveAuthorization()
    await simulatedFetch(ROWS); // loadOrganizationContext()
    await delay(SIMULATED_NETWORK_ROUND_TRIP_MS); // layout: getNotifications (série)
    await delay(SIMULATED_NETWORK_ROUND_TRIP_MS); // layout: getOperationalDashboard (série)
    await delay(SIMULATED_NETWORK_ROUND_TRIP_MS); // layout: listMyRestrictedOrganizations (série)
    timings.push(performance.now() - start);
  }
  return timings;
}

async function measureAfter(navigations) {
  // APRÈS le correctif : cache in-process (TTL 5 min) partagé entre
  // getActiveAuthorization()/loadOrganizationContext(), et les 3 appels du
  // layout regroupés dans un seul Promise.all.
  const cache = new CapabilityCatalogCache(() => simulatedFetch(ROWS));
  const timings = [];
  for (let index = 0; index < navigations; index += 1) {
    const start = performance.now();
    await cache.getCatalog(); // getActiveAuthorization() -> cache
    await cache.getCatalog(); // loadOrganizationContext() -> cache (hit si < TTL)
    await Promise.all([
      delay(SIMULATED_NETWORK_ROUND_TRIP_MS), // getNotifications
      delay(SIMULATED_NETWORK_ROUND_TRIP_MS), // getOperationalDashboard
      delay(SIMULATED_NETWORK_ROUND_TRIP_MS), // listMyRestrictedOrganizations
    ]);
    timings.push(performance.now() - start);
  }
  return { timings, fetchCount: cache.fetchCount };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

const NAVIGATIONS = 5;
const before = await measureBefore(NAVIGATIONS);
const after = await measureAfter(NAVIGATIONS);

console.log("=== CONTRATS-UX-PILOTE-01 — navigation entre onglets (simulée, RTT=%dms) ===", SIMULATED_NETWORK_ROUND_TRIP_MS);
console.log("AVANT (5 appels réseau simulés/navigation, 3 en série) :", before.map(round), "ms");
console.log("APRÈS — onglet FROID (1er, cache vide, 2 appels catalogue + 3 en parallèle) :", round(after.timings[0]), "ms");
console.log("APRÈS — onglets CHAUDS (suivants, cache déjà chaud, 0 appel catalogue) :", after.timings.slice(1).map(round), "ms");
console.log("Appels réels au fetcher du catalogue après le correctif (attendu = 1 pour", NAVIGATIONS, "navigations) :", after.fetchCount);
console.log("Réduction mesurée, onglet froid : ", round(before[0] - after.timings[0]), "ms (", round(100 * (1 - after.timings[0] / before[0])), "% )");
console.log("Réduction mesurée, onglet chaud moyen : ", round(before.slice(1).reduce((a,b)=>a+b,0)/ (NAVIGATIONS-1) - after.timings.slice(1).reduce((a,b)=>a+b,0)/(NAVIGATIONS-1)), "ms");
