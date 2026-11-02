// Limiteur de débit en mémoire (fenêtre fixe) pour les routes sensibles qui
// n'ont pas de limitation côté base : import, support, création de données.
// Le serveur de production est un seul processus Node (`next start`) : un
// compteur en mémoire suffit et ne demande aucune migration. Au redémarrage,
// les compteurs repartent de zéro, ce qui reste sans danger.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count > limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

export function clientKey(request: Request, scope: string, userId?: string | null) {
  if (userId) return `${scope}:u:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:ip:${forwarded || request.headers.get("x-real-ip") || "inconnu"}`;
}
