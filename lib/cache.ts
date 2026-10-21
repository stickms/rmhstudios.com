/**
 * Lightweight in-memory cache for Next.js API routes.
 *
 * Uses a Map with TTL-based expiry. Entries are lazily evicted on access
 * and periodically swept to bound memory.
 *
 * For a single-instance deployment (which this project uses), this avoids
 * round-trips to an external cache (Redis) while still dramatically reducing
 * redundant DB queries on hot paths (leaderboards, profiles, feed).
 *
 * Usage:
 *   const cached = apiCache.get<LeaderboardRow[]>("leaderboard:altair");
 *   if (cached) return cached;
 *   const data = await prisma.altairPlayer.findMany(...);
 *   apiCache.set("leaderboard:altair", data, 30_000); // 30s TTL
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  bytes: number;
}

/** Nodes visited by the size estimator before it stops and extrapolates. */
const ESTIMATE_NODE_BUDGET = 400;
/** Flat per-node overhead (object header / pointer / number slot), bytes. */
const NODE_OVERHEAD = 16;

/**
 * perf: approximate retained size of a cached value WITHOUT JSON.stringify
 * (which would serialize every page on the hot `set` path). Strings count
 * 2 bytes/char; objects/arrays are walked breadth-limited to
 * ESTIMATE_NODE_BUDGET nodes and, if the budget runs out, the remainder is
 * extrapolated from the average node cost so far. Cheap (bounded), and only
 * needs to be right within a small factor — it guards the heap, not billing.
 * Callers that already hold a serialized length can pass it to `set`.
 */
export function estimateBytes(value: unknown): number {
  if (typeof value === 'string') return value.length * 2 + NODE_OVERHEAD;
  if (value === null || typeof value !== 'object') return NODE_OVERHEAD;
  let bytes = 0;
  let visited = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    visited++;
    if (typeof v === 'string') {
      bytes += v.length * 2 + NODE_OVERHEAD;
    } else if (v !== null && typeof v === 'object') {
      bytes += NODE_OVERHEAD;
      if (visited >= ESTIMATE_NODE_BUDGET) {
        // Unvisited children remain on the stack; extrapolate from the average.
        bytes += (bytes / visited) * stack.length;
        break;
      }
      if (v instanceof Date) continue;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) stack.push(v[i]);
      } else {
        for (const k in v as Record<string, unknown>) {
          bytes += k.length * 2;
          stack.push((v as Record<string, unknown>)[k]);
        }
      }
    } else {
      bytes += NODE_OVERHEAD;
    }
  }
  return Math.ceil(bytes);
}

export interface ApiCacheOptions {
  maxEntries?: number;
  /** Approximate byte budget; least-recently-used entries are evicted past it. */
  maxBytes?: number;
}

/**
 * TTL + true-LRU cache bounded by entry count AND approximate bytes.
 * `Map` iterates in insertion order, so "delete + re-insert on hit" keeps the
 * least-recently-used key first; eviction pops from the front.
 */
export class ApiCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private totalBytes = 0;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: ApiCacheOptions | number = {}) {
    const o = typeof opts === 'number' ? { maxEntries: opts } : opts;
    this.maxEntries = o.maxEntries ?? 5000;
    this.maxBytes = o.maxBytes ?? 64 * 1024 * 1024;
    // Sweep expired entries every 60s
    this.gcTimer = setInterval(() => this.sweep(), 60_000);
    // Don't block process shutdown
    if (this.gcTimer && typeof this.gcTimer === 'object' && 'unref' in this.gcTimer) {
      this.gcTimer.unref();
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.remove(key, entry);
      return undefined;
    }
    // LRU: refresh recency.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  /** `sizeBytes`: optional caller-known size (e.g. a serialized length). */
  set<T>(key: string, value: T, ttlMs: number, sizeBytes?: number): void {
    const bytes = sizeBytes ?? estimateBytes(value);
    const existing = this.store.get(key);
    if (existing) {
      // Overwrite: drop the old entry so the new one lands at the MRU end and
      // an overwrite never evicts an unrelated key.
      this.remove(key, existing);
    }
    // A single value larger than the whole budget is not worth caching.
    if (bytes > this.maxBytes) return;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, bytes });
    this.totalBytes += bytes;
    // Evict least-recently-used until within both caps (never the new key).
    while (
      this.store.size > 1 &&
      (this.store.size > this.maxEntries || this.totalBytes > this.maxBytes)
    ) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      this.remove(oldest, this.store.get(oldest));
    }
  }

  private remove(key: string, entry: CacheEntry<unknown> | undefined): void {
    if (this.store.delete(key) && entry) this.totalBytes -= entry.bytes;
  }

  /** Delete a specific key (e.g. after a mutation invalidates cached data). */
  invalidate(key: string): void {
    this.remove(key, this.store.get(key));
  }

  /** Delete all keys matching a prefix (e.g. "leaderboard:"). */
  invalidatePrefix(prefix: string): void {
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) this.remove(key, entry);
    }
  }

  /** Remove all expired entries. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.remove(key, entry);
    }
  }

  /** Total entries currently stored (useful for monitoring). */
  get size(): number {
    return this.store.size;
  }

  /** Approximate bytes retained (monitoring / tests). */
  get bytes(): number {
    return this.totalBytes;
  }
}

/**
 * perf: per-viewer signed-in feed pages (`feed:v2:*`, one per user x surface x
 * filter, tens of KB each) get their own small cache so a burst of distinct
 * viewers can never evict the global hot keys (anon SWR feed, sidebar:*) from
 * the main cache. Routed by key prefix inside `apiCache` so cachedSWR and every
 * other caller keep using the single `apiCache` API unchanged.
 */
export const viewerFeedCache = new ApiCache({ maxEntries: 1000, maxBytes: 24 * 1024 * 1024 });
const VIEWER_FEED_PREFIX = 'feed:v2:';

/** Main process cache (global keys + everything else): 5000 entries / 64 MB. */
const mainCache = new ApiCache({ maxEntries: 5000, maxBytes: 64 * 1024 * 1024 });

const pick = (key: string) => (key.startsWith(VIEWER_FEED_PREFIX) ? viewerFeedCache : mainCache);

/** Singleton cache shared across all API routes in a process (same API as ApiCache). */
export const apiCache = {
  get: <T>(key: string): T | undefined => pick(key).get<T>(key),
  set: <T>(key: string, value: T, ttlMs: number, sizeBytes?: number): void =>
    pick(key).set(key, value, ttlMs, sizeBytes),
  invalidate: (key: string): void => pick(key).invalidate(key),
  invalidatePrefix: (prefix: string): void => {
    mainCache.invalidatePrefix(prefix);
    viewerFeedCache.invalidatePrefix(prefix);
  },
  get size(): number {
    return mainCache.size + viewerFeedCache.size;
  },
};
