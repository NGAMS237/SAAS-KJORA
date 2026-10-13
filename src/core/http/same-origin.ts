function parseOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== "/") return null;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredAppOrigin() {
  const origin = parseOrigin(process.env.KJORA_APP_ORIGIN?.trim());
  if (!origin) return null;
  const parsed = new URL(origin);
  const local = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]";
  return parsed.protocol === "https:" || local ? origin : null;
}

/**
 * Protects browser mutations from cross-origin requests, including when
 * Next.js runs behind a reverse proxy whose internal request URL no longer
 * matches the public origin. The public origin is explicit server
 * configuration; proxy headers supplied by a client are never trusted.
 */
export function isSameOriginRequest(request: Request) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return true;

  const origin = parseOrigin(rawOrigin);
  if (!origin) return false;

  const requestOrigin = parseOrigin(new URL(request.url).origin);
  if (requestOrigin === origin) return true;

  return configuredAppOrigin() === origin;
}
