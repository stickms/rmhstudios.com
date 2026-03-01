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
}

class ApiCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxEntries = 1000) {
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
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Delete a specific key (e.g. after a mutation invalidates cached data). */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Delete all keys matching a prefix (e.g. "leaderboard:"). */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
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
}

/** Singleton cache instance shared across all API routes in a process. */
export const apiCache = new ApiCache();
