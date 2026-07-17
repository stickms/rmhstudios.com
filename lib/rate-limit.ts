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

export function rateLimit(ip: string, opts: RateLimitOptions): RateLimitResult {
    const key = `${opts.prefix ?? 'rl'}:${ip}`;
    const limit = Math.ceil(opts.limit * RATE_LIMIT_MULTIPLIER);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        // Evict oldest entry if at capacity (FIFO — Map preserves insertion order)
        if (store.size >= MAX_STORE_SIZE) {
            const oldest = store.keys().next().value;
            if (oldest !== undefined) store.delete(oldest);
        }
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

    const forwarded = headers.get('x-forwarded-for')
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
