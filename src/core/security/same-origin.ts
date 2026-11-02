// Garde CSRF « même origine » pour les routes API mutantes (POST).
//
// Pourquoi ce module existe : derrière un proxy/CDN (hébergement Hostinger
// « hcdn »), `new URL(request.url).origin` reflète l'adresse INTERNE du serveur
// Node (autre hôte ou protocole http), jamais l'adresse publique que le
// navigateur a utilisée. Comparer l'en-tête `Origin` à cette valeur rejetait
// donc TOUS les POST légitimes (HTTP 403 « forbidden »), y compris l'aperçu de
// l'import de données.
//
// On compare l'hôte de `Origin` aux hôtes que le serveur peut légitimement
// connaître pour cette requête : celui de l'URL, l'en-tête `x-forwarded-host`
// (posé par le proxy) et l'en-tête `Host`. Un site tiers ne peut pas forger
// ces en-têtes depuis un navigateur, et `Origin` est toujours posé par le
// navigateur sur un POST : le blocage CSRF reste donc effectif. Même principe
// que la vérification d'origine des Server Actions de Next.js.

function firstValue(header: string | null): string | null {
  const value = header?.split(",")[0]?.trim().toLowerCase();
  return value ? value : null;
}

export function isSameOrigin(request: Request, options: { requireOrigin?: boolean } = {}): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return !options.requireOrigin;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== "https:" && originUrl.protocol !== "http:") return false;

  let requestHost: string | null = null;
  try {
    requestHost = new URL(request.url).host.toLowerCase();
  } catch {
    requestHost = null;
  }

  const allowedHosts = [
    requestHost,
    firstValue(request.headers.get("x-forwarded-host")),
    firstValue(request.headers.get("host")),
  ].filter((host): host is string => Boolean(host));

  return allowedHosts.includes(originUrl.host.toLowerCase());
}
