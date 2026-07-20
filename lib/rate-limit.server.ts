/**
 * Redis-first rate limiter with in-process fallback — server-only.
 *
 * `rateLimit()` in lib/rate-limit.ts is per-process: with multiple web
 * instances each keeps its own counters, so a client effectively gets
 * `limit × instances`, and every deploy resets the window. `checkRateLimit()`
 * coordinates through the shared Redis backplane when it's available and falls
 * back to the in-process limiter otherwise — so it is correct across instances
 * without becoming a hard dependency on Redis.
 *
 * This is the async generalisation of the `limit()` helper in
 * lib/api/with-developer-api.server.ts; prefer it for new/hot routes and for
 * authenticated endpoints (pass a userId-based key so per-account abuse can't
 * be bypassed by rotating IPs).
 *
 * Usage (drop-in for `rateLimit`, just add `await`):
 *   const rl = await checkRateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'post' });
 *   if (!rl.allowed) return tooMany(rl);
 *   // authenticated — key by user so IP rotation doesn't help:
 *   const rl = await checkRateLimit(session.user.id, { limit: 30, windowMs: 60_000, prefix: 'dm:send' });
 */

import { redisRateLimit } from '@/lib/redis.server';
import {
  rateLimit,
  getClientIp,
  RATE_LIMIT_MULTIPLIER,
  type RateLimitResult,
} from '@/lib/rate-limit';

export { getClientIp };
export type { RateLimitResult };

export interface CheckRateLimitOptions {
  limit: number;
  windowMs: number;
  /** Namespace so different limiters on the same identity don't share a bucket. */
  prefix?: string;
  /**
   * Apply the global RATE_LIMIT_MULTIPLIER (default true, matching the
   * in-process `rateLimit`). Set false for security-critical limiters (auth,
   * abuse) that should use the raw, un-inflated limit.
   */
  applyMultiplier?: boolean;
}

/**
 * Check + increment a rate limit for `identity` (an IP or a userId). Tries
 * Redis first (shared across instances); on any Redis miss/error falls back to
 * the in-process limiter so the route is never left unprotected.
 */
export async function checkRateLimit(
  identity: string,
  opts: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  const applyMult = opts.applyMultiplier !== false;
  const effectiveLimit = applyMult ? Math.ceil(opts.limit * RATE_LIMIT_MULTIPLIER) : opts.limit;
  const key = `${opts.prefix ?? 'rl'}:${identity}`;

  const viaRedis = await redisRateLimit(key, effectiveLimit, opts.windowMs);
  if (viaRedis) return viaRedis;

  // Redis unavailable → in-process. Pass the raw limit; `rateLimit` applies the
  // multiplier itself, so only pass through when applyMultiplier is on.
  if (applyMult) {
    return rateLimit(identity, { limit: opts.limit, windowMs: opts.windowMs, prefix: opts.prefix });
  }
  // No multiplier wanted: emulate by passing a limit that, after rateLimit's
  // internal ×MULTIPLIER, yields opts.limit.
  const raw = Math.max(1, Math.round(opts.limit / RATE_LIMIT_MULTIPLIER));
  return rateLimit(identity, { limit: raw, windowMs: opts.windowMs, prefix: opts.prefix });
}
