// LOT-1 — en-têtes de sécurité HTTP.
//
// Appliqués par l'application elle-même : l'hébergeur (hcdn) n'ajoute que
// `upgrade-insecure-requests`. Les en-têtes « durs » sont appliqués tout de
// suite ; la Content-Security-Policy est d'abord en mode RAPPORT
// (Content-Security-Policy-Report-Only) : le navigateur signale les violations
// dans la console sans rien bloquer. On la passera en mode bloquant après
// observation, pour ne pas casser l'application. Une CSP stricte à nonce
// exigerait un rendu dynamique de toutes les pages : hors périmètre de ce lot.
function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
}

export function buildContentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const supabaseWs = supabase.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
