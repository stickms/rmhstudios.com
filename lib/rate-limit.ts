/**
 * In-memory fallback rate limiter for TanStack Start API routes.
 *
 * Bounded Map with periodic GC prevents unbounded memory growth.
 * Max store size caps memory at ~100 KB even under heavy abuse.
 *
 * Usage:
 *   const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000 });
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_STORE_SIZE = 10_000;
const store = new Map<string, RateLimitEntry>();

// Sweep expired entries every 60s
const gcTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);
if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) {
  gcTimer.unref();
}

interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Key prefix to namespace different limiters */
  prefix?: string;
}

/**
 * Global generosity multiplier applied to every per-call-site limit. The site's
 * individual limits were tuned conservatively; this loosens them everywhere at
 * once so normal (and lightly bursty) usage isn't throttled, while still
 * stopping runaway abuse. Tunable via RATE_LIMIT_MULTIPLIER (clamped 1–20).
 */
export const RATE_LIMIT_MULTIPLIER = (() => {
  const raw = Number(process.env.RATE_LIMIT_MULTIPLIER);
  if (!Number.isFinite(raw) || raw <= 0) return 4;
  return Math.min(20, Math.max(1, raw));
})();

/**
 * Result of a rate-limit check. `limit`/`remaining`/`reset` are additive fields
 * (existing callers only read `allowed`/`retryAfter`) used to emit standard
 * `X-RateLimit-*` headers. `reset` is an epoch-ms timestamp for the window end.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * perf: amortized eviction. This used to scan ALL 10k entries for the
 * soonest-expiring one on every new key once the store was full (O(n) per
 * request under key churn / abuse). Now one pass drops every expired entry and,
 * if that frees too little, evicts a batch of the soonest-expiring live ones
 * (same victim choice as before, just 5% at a time), so the next ~500 inserts
 * are O(1). A live, still-counting window is only ever dropped after every
 * entry that ends sooner.
 */
const EVICT_BATCH = Math.ceil(MAX_STORE_SIZE * 0.05);
function makeRoom(now: number): void {
  for (const [k, e] of store) {
    if (e.resetAt < now) store.delete(k);
  }
  if (store.size <= MAX_STORE_SIZE - EVICT_BATCH) return;
  const byExpiry = [...store].sort((x, y) => x[1].resetAt - y[1].resetAt);
  for (let i = 0; i < EVICT_BATCH && i < byExpiry.length; i++) store.delete(byExpiry[i][0]);
}

export function rateLimit(ip: string, opts: RateLimitOptions): RateLimitResult {
  const key = `${opts.prefix ?? 'rl'}:${ip}`;
  const limit = Math.ceil(opts.limit * RATE_LIMIT_MULTIPLIER);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    if (store.size >= MAX_STORE_SIZE) makeRoom(now);
    const reset = now + opts.windowMs;
    store.set(key, { count: 1, resetAt: reset });
    return { allowed: true, retryAfter: 0, limit, remaining: limit - 1, reset };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter, limit, remaining: 0, reset: entry.resetAt };
  }

  return { allowed: true, retryAfter: 0, limit, remaining, reset: entry.resetAt };
}

/**
 * Extract the client IP at a trusted reverse-proxy boundary.
 *
 * Production prefers Cloudflare's canonical header. For non-Cloudflare proxy
 * deployments, TRUST_PROXY_HOPS selects from the RIGHT side of X-Forwarded-For
 * (the side appended by trusted proxies), never the attacker-controlled leftmost
 * value. The origin firewall must still reject direct public traffic.
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;

  const forwarded =
    headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? [];
  const configuredHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
  const trustedHops = Number.isFinite(configuredHops) ? Math.max(1, configuredHops) : 1;
  if (forwarded.length > 0) {
    return forwarded[Math.max(0, forwarded.length - trustedHops)] ?? '127.0.0.1';
  }

  return headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

/**
 * Named rate-limit policies. Limits are PRE-multiplier (the effective ceiling is
 * `limit × RATE_LIMIT_MULTIPLIER`). Keep the buckets coarse — the point of
 * consolidation is that most routes pick a category, not a bespoke number.
 */
export const RATE_LIMIT_POLICIES = {
  read: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  ai: { limit: 20, windowMs: 60_000 },
  upload: { limit: 10, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
} as const;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;

export interface WithRateLimitOptions {
  /**
   * Adds a per-subject dimension so the limit is per-subject-per-IP (e.g. pass a
   * user id). The IP half is ALWAYS derived here — this is the only knob a
   * caller gets, precisely so no route can substitute the wrong request field.
   */
  scope?: string;
  /** Override the policy's limit (rare — prefer a named policy). */
  limit?: number;
  /** Override the policy's window (rare — prefer a named policy). */
  windowMs?: number;
  /** Bucket namespace; defaults to the policy name. Set when one route needs its own bucket. */
  prefix?: string;
  /**
   * Body message for the 429. Defaults to `'Too many requests'`. Only set it
   * where a route already shipped a more specific string that clients or copy
   * depend on — new routes should take the default so the site speaks with one
   * voice.
   */
  message?: string;
}

/**
 * The one correct rate-limit entry point for API routes.
 *
 * The key is ALWAYS derived from `getClientIp(request)` — callers cannot pass a
 * key, which is the whole point: the drift this consolidates was routes reaching
 * for the wrong request field (`request.ip`, raw `x-forwarded-for`) and sharing
 * one bucket behind the proxy. Returns a ready-to-return **429 `Response`** (with
 * `Retry-After` + `X-RateLimit-*` headers) when the limit is exceeded, or `null`
 * when the request may proceed:
 *
 * ```ts
 * const limited = withRateLimit(request, 'write');
 * if (limited) return limited;
 * // per-user + per-IP:
 * const limited = withRateLimit(request, 'ai', { scope: session.user.id });
 * ```
 */
export function withRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  opts: WithRateLimitOptions = {},
): Response | null {
  const preset = RATE_LIMIT_POLICIES[policy];
  const ip = getClientIp(request);
  const key = opts.scope ? `${opts.scope}:${ip}` : ip;
  const result = rateLimit(key, {
    limit: opts.limit ?? preset.limit,
    windowMs: opts.windowMs ?? preset.windowMs,
    prefix: opts.prefix ?? policy,
  });
  if (result.allowed) return null;
  return Response.json(
    { error: opts.message ?? 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}
