const CACHE_NAME = "kjora-public-v3";
const PRECACHE = ["/icon.svg", "/manifest.webmanifest", "/hors-ligne/"];
const PUBLIC_PAGES = new Set(["/hors-ligne/", "/partenaires", "/partenaires/"]);
const NEVER_CACHE_PREFIXES = [
  "/api/", "/app/", "/administration/", "/portal/", "/partenaire/", "/auth/",
  "/connexion/", "/onboarding/", "/invitation/", "/verrouillage/", "/organisation-suspendue/",
];
const PRIVATE_RESOURCE_MARKERS = ["/contracts/", "/contrats/", "/documents/", "/financial-documents/", "/factures/", ".pdf"];

function isPublicCacheable(response) {
  const cacheControl = response.headers.get("cache-control") || "";
  return response.ok
    && !response.headers.has("set-cookie")
    && !/(private|no-store)/i.test(cacheControl);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.headers.has("authorization") || url.origin !== self.location.origin
      || NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
      || PRIVATE_RESOURCE_MARKERS.some((marker) => url.pathname.toLowerCase().includes(marker))) return;

  if (request.mode === "navigate") {
    if (!PUBLIC_PAGES.has(url.pathname)) return;
    event.respondWith(fetch(request).then((response) => {
      if (isPublicCacheable(response)) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/hors-ligne/"))));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (isPublicCacheable(response)) caches.open(CACHE_NAME).then((cache) => cache.put(request,response.clone()));
      return response;
    })));
  }
});
