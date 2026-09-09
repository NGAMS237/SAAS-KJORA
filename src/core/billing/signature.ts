// =============================================================================
// KJORA — Vérification de signature de webhook (ALIGN-04A / corrigé ALIGN-04A.2)
// =============================================================================
// Utilitaire partagé par les adaptateurs. Ne lit aucun secret lui-même : le
// secret lui est remis par `provider-config.ts`, seul module habilité à le lire.
//
// Deux exigences que ce module rend impossibles à contourner par distraction :
//   • la signature porte sur le corps BRUT, jamais sur un JSON reparsé ;
//   • la comparaison est à temps constant, pour ne pas laisser fuir la
//     signature attendue octet par octet.
//
// Correctif ALIGN-04A.2 — vérifié contre la documentation officielle :
//   Flutterwave calcule `HMAC-SHA256(secretHash, corps_brut)` et l'encode en
//   **base64**, transmis dans l'en-tête `flutterwave-signature`
//   (developer.flutterwave.com/docs/webhooks, consulté 2026-09-09). ALIGN-04A
//   supposait un encodage hexadécimal générique, jamais vérifié faute de
//   documentation consultée à l'époque. Un encodage base64 est **sensible à
//   la casse** : la comparaison ALIGN-04A appliquait `.toLowerCase()` aux deux
//   valeurs, ce qui aurait rejeté silencieusement toute signature Flutterwave
//   légitime contenant une majuscule. Corrigé ici, avant qu'aucun adaptateur
//   ne soit écrit contre ce module — donc sans avoir jamais affecté un webhook
//   réel.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export type DigestEncoding = "hex" | "base64";

export function hmacDigest(rawBody: string, secret: string, encoding: DigestEncoding): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest(encoding);
}

/** @deprecated Conservé pour compatibilité — préférer `hmacDigest(body, secret, "hex")`. */
export function hmacSha256Hex(rawBody: string, secret: string): string {
  return hmacDigest(rawBody, secret, "hex");
}

/**
 * Comparaison à temps constant. L'hexadécimal est insensible à la casse par
 * construction (0-9a-f) ; le base64 est sensible à la casse (A-Za-z0-9+/=) et
 * ne doit **jamais** être normalisé avant comparaison, sous peine de rejeter
 * des signatures valides ou — pire — d'en accepter une falsifiée dont seule
 * la casse diffère.
 */
export function signaturesMatch(
  expected: string,
  received: string,
  encoding: DigestEncoding = "hex",
): boolean {
  const normalise = (s: string) => (encoding === "hex" ? s.trim().toLowerCase() : s.trim());
  const a = Buffer.from(normalise(expected), "utf8");
  const b = Buffer.from(normalise(received), "utf8");
  // timingSafeEqual exige des longueurs égales : on le fait dire « non »
  // plutôt que lever, sans jamais court-circuiter sur le contenu.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type SignatureRejection = "missing_signature" | "provider_not_configured" | "invalid_signature";

export function verifyHmacSignature(
  rawBody: string,
  receivedSignature: string | undefined,
  secret: string | null,
  encoding: DigestEncoding,
): { valid: boolean; reason?: SignatureRejection } {
  if (!secret) return { valid: false, reason: "provider_not_configured" };
  if (!receivedSignature || receivedSignature.trim().length === 0) {
    return { valid: false, reason: "missing_signature" };
  }
  return signaturesMatch(hmacDigest(rawBody, secret, encoding), receivedSignature, encoding)
    ? { valid: true }
    : { valid: false, reason: "invalid_signature" };
}

/** @deprecated Conservé pour compatibilité — équivalent à l'encodage hex. */
export function verifyHmacSha256(
  rawBody: string,
  receivedSignature: string | undefined,
  secret: string | null,
): { valid: boolean; reason?: SignatureRejection } {
  return verifyHmacSignature(rawBody, receivedSignature, secret, "hex");
}

/**
 * Vérification spécifique Flutterwave : en-tête `flutterwave-signature`,
 * corps brut, HMAC-SHA256 encodé en base64. Documenté ici plutôt que dans un
 * adaptateur, puisqu'aucun adaptateur Flutterwave n'existe encore (ALIGN-04A.2
 * est bloqué faute de credentials sandbox — voir
 * docs/product/KJORA-PROVIDER-SANDBOX-GUIDE-v0.1.md).
 */
export function verifyFlutterwaveSignature(
  rawBody: string,
  receivedSignature: string | undefined,
  secretHash: string | null,
): { valid: boolean; reason?: SignatureRejection } {
  return verifyHmacSignature(rawBody, receivedSignature, secretHash, "base64");
}
