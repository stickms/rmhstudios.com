/**
 * Simple in-memory IP rate limiter for Next.js API routes.
 * Usage: const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000 });
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (entry.resetAt < now) store.delete(key);
    }
}, 5 * 60 * 1000);

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

/** Extract real IP from Next.js request, handling proxies */
export function getClientIp(req: Request): string {
    const headers = req.headers;
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        headers.get('x-real-ip') ??
        '127.0.0.1'
    );
}
