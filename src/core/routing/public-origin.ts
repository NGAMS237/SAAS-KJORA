/**
 * Hostinger proxies the public application to the Node process.  Route
 * handlers can therefore see the internal 0.0.0.0 host in request.url even
 * when the browser is on kjorapp.com.  Only trust the known public host when
 * constructing browser-facing redirects; local and preview environments keep
 * their request origin.
 */
export function getPublicRequestOrigin(request: {
  headers: Headers;
  nextUrl: URL;
}) {
  const forwardedHost = request.headers.get("x-forwarded-host")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();

  if (
    forwardedHost === "kjorapp.com" ||
    request.nextUrl.hostname === "kjorapp.com" ||
    request.nextUrl.hostname === "0.0.0.0"
  ) {
    return "https://kjorapp.com";
  }

  return request.nextUrl.origin;
}
