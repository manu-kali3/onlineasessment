/**
 * In-process sliding-window rate limiter.
 *
 * Scope warning: state lives in this module, so it is per-instance. On Vercel
 * each serverless instance keeps its own counters, which means the effective
 * limit is roughly (instances x limit) and an attacker can spread requests
 * across cold starts to evade it. That is acceptable as a speed bump and a
 * blast-radius cap; it is NOT a security boundary.
 *
 * The durable answer is a shared store — Redis, or a Postgres table keyed by
 * IP plus action with a row-level expiry — which survives restarts and scales
 * horizontally. Swap `rateLimit` for that without changing any call sites.
 */

type Bucket = {
  /** Epoch millis of each hit, oldest first. */
  hits: number[];
};

const buckets = new Map<string, Bucket>();

/** Bound memory: drop buckets that are full and idle. */
const IDLE_MS = 10 * 60_000;

let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < IDLE_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < IDLE_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the caller may retry. */
  retryAfterSec: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    ok: true,
    remaining: limit - bucket.hits.length,
    retryAfterSec: 0,
  };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/** Test seam: clears all counters. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = Date.now();
}