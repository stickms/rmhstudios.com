/**
 * In-memory IP rate limiter for Next.js API routes.
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

export function rateLimit(ip: string, opts: RateLimitOptions): { allowed: boolean; retryAfter: number } {
    const key = `${opts.prefix ?? 'rl'}:${ip}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        // Evict oldest entry if at capacity (FIFO — Map preserves insertion order)
        if (store.size >= MAX_STORE_SIZE) {
            const oldest = store.keys().next().value;
            if (oldest !== undefined) store.delete(oldest);
        }
        store.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { allowed: true, retryAfter: 0 };
    }

    entry.count++;
    if (entry.count > opts.limit) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfter };
    }

    return { allowed: true, retryAfter: 0 };
}

/**
 * Extract real client IP from Next.js request.
 * IMPORTANT: This trusts X-Forwarded-For, which is only safe behind a trusted
 * reverse proxy (nginx, Cloudflare) that sets/overwrites this header.
 * Without a trusted proxy, clients can spoof this header to bypass rate limits.
 */
export function getClientIp(req: Request): string {
    const headers = req.headers;
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        headers.get('x-real-ip') ??
        '127.0.0.1'
    );
}
