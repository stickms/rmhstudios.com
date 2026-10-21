/**
 * Lightweight in-memory cache for API routes.
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
}

/**
 * Capacity, in entries, with the memory estimate behind the default
 * (03-rules section 2, Memory).
 *
 * Every caller shares this one map: per-user entries (saved searches, feed
 * signals, tiers, muted words), per-community config, leaderboards. The old
 * default of 1000 was a FIFO, so a few hundred active users each holding a few
 * keys evicted the hot shared entries (config, leaderboards) first-in-first-out
 * and the hit rate collapsed.
 *
 * Estimate: a value here is a small JSON-ish object, typically 1-8 KB (a tier, a
 * rule list, a top-50 board); the rare large ones (an AI text, a feed probe) are
 * 20-40 KB. At a 5 KB average, 5000 entries is ~25 MB of heap per web worker,
 * and production runs 2 workers (docker-compose `NITRO_CLUSTER_WORKERS`), so
 * ~50 MB resident in the worst case, a small fraction of a worker's old-space
 * limit. Raise or lower with `API_CACHE_MAX_ENTRIES` (clamped to 100..100000).
 */
export const DEFAULT_API_CACHE_MAX_ENTRIES = 5000;

function configuredMaxEntries(): number {
  const raw = typeof process !== 'undefined' ? Number(process.env?.API_CACHE_MAX_ENTRIES) : NaN;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_API_CACHE_MAX_ENTRIES;
  return Math.min(100_000, Math.max(100, Math.floor(raw)));
}

/**
 * Hook through which local invalidations reach OTHER processes. This module is
 * imported by client-reachable code, so it must not import Redis: the server-only
 * `cached.server.ts` registers the publisher at startup. Without a registered
 * hook (no Redis, tests, the browser) invalidation is local-only, as before.
 */
export interface InvalidationHook {
  key(key: string): void;
  prefix(prefix: string): void;
}

/** Identifies this process in invalidation messages so it can ignore its own echo. */
export const CACHE_PROCESS_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * In-process TTL cache with LRU eviction. Map iteration order is insertion order,
 * so a read re-inserts the entry to mark it most recently used and the first key
 * is always the least recently used.
 */
export class ApiCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private hook: InvalidationHook | null = null;

  constructor(maxEntries = configuredMaxEntries()) {
    this.maxEntries = maxEntries;
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
      this.store.delete(key);
      return undefined;
    }
    // Touch: move to the most-recently-used end.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // Replacing an existing key must not evict someone else.
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxEntries) {
      const lru = this.store.keys().next().value;
      if (lru !== undefined) this.store.delete(lru);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Delete a specific key (e.g. after a mutation) here AND in every other process. */
  invalidate(key: string): void {
    this.store.delete(key);
    this.hook?.key(key);
  }

  /** Delete all keys matching a prefix (e.g. "leaderboard:") here and in every other process. */
  invalidatePrefix(prefix: string): void {
    this.dropLocalPrefix(prefix);
    this.hook?.prefix(prefix);
  }

  /** Drop a key in THIS process only. Used when applying a remote invalidation (no echo). */
  dropLocal(key: string): void {
    this.store.delete(key);
  }

  dropLocalPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Register (or clear, with null) the cross-process publisher. Server-only callers. */
  setInvalidationHook(hook: InvalidationHook | null): void {
    this.hook = hook;
  }

  /** Remove all expired entries. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  /** Total entries currently stored (useful for monitoring). */
  get size(): number {
    return this.store.size;
  }

  get capacity(): number {
    return this.maxEntries;
  }
}

/** Singleton cache instance shared across all API routes in a process. */
export const apiCache = new ApiCache();
