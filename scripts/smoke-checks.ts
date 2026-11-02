// LOT-1 — vérifications de fumée d'un déploiement KJORA, sans dépendance.
//
// Le bogue des « 403 sur tous les POST » (origine comparée à l'adresse interne
// du serveur derrière Hostinger) est invisible aux tests unitaires et aux
// aperçus Vercel : il n'existe qu'en production. Ces contrôles tapent donc le
// site réellement déployé. Aucune écriture : les POST envoyés sont volontairement
// invalides ou non authentifiés et sont refusés avant tout traitement.

export type SmokeResult = { name: string; ok: boolean; detail: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const REQUIRED_HEADERS = ["x-content-type-options", "x-frame-options", "referrer-policy", "strict-transport-security"];

export async function runSmokeChecks(baseUrl: string, fetchImpl: FetchLike = fetch): Promise<SmokeResult[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const origin = new URL(base).origin;
  const results: SmokeResult[] = [];

  async function check(name: string, run: () => Promise<string | null>) {
    try {
      const failure = await run();
      results.push({ name, ok: failure === null, detail: failure ?? "ok" });
    } catch (error) {
      results.push({ name, ok: false, detail: `erreur réseau : ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  const post = (path: string, headers: Record<string, string>, body = "{}") =>
    fetchImpl(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body, redirect: "manual" });

  await check("la page d'accueil répond 200", async () => {
    const response = await fetchImpl(`${base}/`, { redirect: "manual" });
    return response.status === 200 ? null : `statut ${response.status} au lieu de 200`;
  });

  await check("la page de connexion répond 200", async () => {
    const response = await fetchImpl(`${base}/connexion/`, { redirect: "manual" });
    return response.status === 200 ? null : `statut ${response.status} au lieu de 200`;
  });

  await check("l'espace /app/ sans session redirige ou affiche la connexion, jamais d'erreur serveur", async () => {
    const response = await fetchImpl(`${base}/app/`, { redirect: "manual" });
    return response.status < 500 ? null : `statut ${response.status}`;
  });

  await check("REGRESSION 403 : un POST de même origine n'est pas refusé par la garde d'origine", async () => {
    const response = await post("/api/support/", { origin });
    // 400 (charge utile invalide) ou 401 (non connecté) : la garde d'origine a laissé passer.
    return response.status === 400 || response.status === 401
      ? null
      : `statut ${response.status} (attendu 400 ou 401) — la garde d'origine bloque peut-être tout le trafic légitime`;
  });

  await check("l'aperçu d'import de même origine, non connecté, répond 401 (pas 403)", async () => {
    const response = await post("/api/data-import/preview/", { origin }, "");
    return response.status === 401 ? null : `statut ${response.status} (attendu 401)`;
  });

  await check("un POST d'origine étrangère reste refusé (403) : protection CSRF intacte", async () => {
    const response = await post("/api/support/", { origin: "https://evil.example" });
    return response.status === 403 ? null : `statut ${response.status} (attendu 403)`;
  });

  await check("les en-têtes de sécurité sont présents", async () => {
    const response = await fetchImpl(`${base}/`, { redirect: "manual" });
    const missing = REQUIRED_HEADERS.filter((name) => !response.headers.get(name));
    return missing.length === 0 ? null : `manquants : ${missing.join(", ")}`;
  });

  return results;
}
