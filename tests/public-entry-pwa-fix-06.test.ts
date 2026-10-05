import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildConnexionUrl } from "../src/core/onboarding/plan-intent.ts";
import { safeNextPath } from "../src/core/auth/safe-next-path.ts";
import { probePublicConnectivity, reduceConnectivity } from "../src/core/pwa/connectivity.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/app/page.tsx");
const login = read("src/app/connexion/page.tsx");
const registration = read("src/core/pwa/service-worker-registration.tsx");
const sw = read("public/sw.js");
const rootLayout = read("src/app/layout.tsx");
const internalLayout = read("src/app/(internal)/app/layout.tsx");
const portalLayout = read("src/app/(portal)/portal/layout.tsx");

test("la racine rend la vitrine et n'appelle plus redirect ou resolveUserContext", () => {
  assert.doesNotMatch(home, /\bredirect\s*\(/);
  assert.doesNotMatch(home, /resolveUserContext/);
  assert.match(home, /public-home/);
});

test("la vitrine contient les CTA et contenus principaux FR et EN", () => {
  for (const label of ["Se connecter", "Commencer gratuitement", "Sign in", "Get started free", "Questions fréquentes", "Frequently asked questions"]) {
    assert.ok(home.includes(label), `contenu public manquant : ${label}`);
  }
});

test("le CTA de connexion produit une destination interne sûre", () => {
  assert.equal(buildConnexionUrl({ plan: null, billingCycle: null, billingCountry: null, locale: "fr", source: null }), "/connexion?locale=fr&next=%2Fapp");
  assert.equal(buildConnexionUrl({ plan: null, billingCycle: null, billingCountry: null, locale: "en", source: null }), "/connexion?locale=en&next=%2Fapp");
});

test("le CTA gratuit réutilise le parcours Découverte canonique", () => {
  const url = buildConnexionUrl({ plan: "decouverte", billingCycle: "monthly", billingCountry: null, locale: "fr", source: "site" });
  assert.match(url, /^\/connexion\?/);
  assert.match(url, /plan=decouverte/);
  assert.match(url, /billing_cycle=monthly/);
  assert.match(url, /next=%2Fonboarding%2Forganization/);
});

test("la connexion parle d'un espace KJORA, pas seulement d'un espace locatif", () => {
  assert.match(login, /Retrouvez votre espace KJORA/);
  assert.match(login, /Access your KJORA workspace/);
  assert.doesNotMatch(login, /Retrouvez votre espace locatif/);
});

test("l'état initial checking n'affiche pas arbitrairement le bandeau hors ligne", () => {
  assert.equal(reduceConnectivity("checking", { type: "check_started" }), "checking");
  assert.match(registration, /connectivity==="offline"/);
});

test("l'événement offline affiche l'état hors ligne", () => {
  assert.equal(reduceConnectivity("online", { type: "browser_offline" }), "offline");
});

test("une vérification réussie et l'événement online restaurent l'état en ligne", () => {
  assert.equal(reduceConnectivity("offline", { type: "check_succeeded" }), "online");
  assert.match(registration, /addEventListener\("online",markOnline\)/);
});

test("Réessayer exécute une sonde same-origin sans cookie", async () => {
  let requestUrl = "";
  let requestOptions: RequestInit = {};
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestOptions = init ?? {};
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  assert.equal(await probePublicConnectivity(fetcher), true);
  assert.match(requestUrl, /^\/robots\.txt\?connectivity=/);
  assert.equal(requestOptions.credentials, "omit");
  assert.equal(requestOptions.cache, "no-store");
  assert.match(registration, /onClick=\{\(\)=>void verifyConnectivity\(\)\}/);
});

test("une réponse HTTP d'erreur prouve encore le réseau; seule une panne transport passe offline", async () => {
  const apiError = (async () => new Response(null, { status: 503 })) as typeof fetch;
  const networkError = (async () => { throw new TypeError("network unavailable"); }) as typeof fetch;
  assert.equal(await probePublicConnectivity(apiError), true);
  assert.equal(await probePublicConnectivity(networkError), false);
});

test("le service worker ne met en cache aucune route privée", () => {
  for (const prefix of ["/api/", "/app/", "/administration/", "/portal/", "/partenaire/", "/auth/", "/connexion/", "/onboarding/"]) {
    assert.ok(sw.includes(`"${prefix}"`), `préfixe privé absent : ${prefix}`);
  }
  assert.doesNotMatch(sw.match(/const PRECACHE = \[[^;]+/)?.[0] ?? "", /\/app|\/portal|\/connexion|\/api/);
});

test("les espaces applicatif et locataire conservent noindex", () => {
  assert.doesNotMatch(rootLayout, /robots:\s*\{\s*index:\s*false/);
  assert.match(internalLayout, /index:\s*false/);
  assert.match(portalLayout, /index:\s*false/);
});

test("tous les liens internes ajoutés ciblent des routes existantes", () => {
  for (const path of ["aide", "contact", "securite", "confidentialite", "mentions-legales", "connexion", "onboarding/organization"]) {
    assert.equal(existsSync(new URL(`../src/app/${path}/page.tsx`, import.meta.url)), true, `route manquante : /${path}`);
  }
});

test("safeNextPath continue de refuser les redirections ouvertes", () => {
  for (const hostile of ["https://evil.example", "//evil.example", "/\\evil.example", "/%0a//evil.example"]) {
    assert.equal(safeNextPath(hostile), "/app");
  }
  assert.equal(safeNextPath("/app?tab=billing"), "/app?tab=billing");
});
