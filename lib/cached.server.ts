/**
 * Shared L1 (in-process) + L2 (Redis) cache helper with cross-instance
 * invalidation — server-only.
 *
 * The in-process `apiCache` (lib/cache.ts) is fast but per-process: with more
 * than one web instance its entries drift and `invalidate()` only clears the
 * local copy. This module layers Redis underneath so that:
 *   - a value warmed on instance A is visible to instance B (L2 hit), and
 *   - an invalidation on any instance is broadcast to all instances (pub/sub),
 *     so every L1 copy is dropped.
 *
 * When `REDIS_URL` is unset everything degrades to plain in-process behaviour
 * (identical to using `apiCache` directly), so single-instance / local dev is
 * unaffected.
 *
 * Usage:
 *   const tier = await cached(`entitlements:tier:${userId}`, 60_000, () =>
 *     resolveTierFromDb(userId));
 *   // after a change:
 *   await invalidateCached(`entitlements:tier:${userId}`);
 *
 * This is the generalisation of the L1+L2 pattern already used by
 * lib/feed/personalize.server.ts — migrate coherence-sensitive caches onto it.
 */

import { apiCache } from '@/lib/cache';
import {
  redisEnabled,
  redisGetJSON,
  redisSetJSON,
  redisDel,
  redisPublish,
  redisSubscribe,
} from '@/lib/redis.server';

/** Pub/sub channel carrying "drop this key / prefix everywhere" messages. */
const INVALIDATION_CHANNEL = 'cache:invalidate';

type InvalidationMessage =
  | { type: 'key'; key: string }
  | { type: 'prefix'; prefix: string };

let subscribed = false;

/**
 * Lazily subscribe (once per process) to the invalidation channel so remote
 * invalidations drop our local L1 copy. No-op without Redis.
 */
function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  if (!redisEnabled()) return;
  redisSubscribe(INVALIDATION_CHANNEL, (data) => {
    const msg = data as InvalidationMessage;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'key' && typeof msg.key === 'string') {
      apiCache.invalidate(msg.key);
    } else if (msg.type === 'prefix' && typeof msg.prefix === 'string') {
      apiCache.invalidatePrefix(msg.prefix);
    }
  });
}

export interface CachedOptions {
  /**
   * Also consult/populate the shared Redis L2. Default true. Set false for
   * values that are cheap to recompute but not worth a Redis round-trip, or
   * that must never be shared across instances.
   */
  l2?: boolean;
  /**
   * Skip caching a value the loader returns (e.g. don't cache nulls/misses).
   * Return true to store, false to bypass the cache for this result.
   */
  shouldCache?: (value: unknown) => boolean;
}

/**
 * Read-through cache: L1 (in-process) → L2 (Redis) → loader. Warms both layers
 * on a miss. Concurrent callers within a process share one loader invocation
 * via an in-flight promise map (prevents a local stampede).
 */
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: CachedOptions = {}
): Promise<T> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;

  // L1
  const local = apiCache.get<T>(key);
  if (local !== undefined) return local;

  // Coalesce concurrent local callers.
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      // L2
      if (useL2 && redisEnabled()) {
        const remote = await redisGetJSON<T>(key);
        if (remote !== null && remote !== undefined) {
          apiCache.set(key, remote, ttlMs);
          return remote;
        }
      }
      // Loader
      const value = await loader();
      const store = opts.shouldCache ? opts.shouldCache(value) : true;
      if (store) {
        apiCache.set(key, value, ttlMs);
        if (useL2 && redisEnabled()) {
          // Best-effort; don't block on the write.
          void redisSetJSON(key, value, ttlMs);
        }
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Stale-while-revalidate read-through cache (L1 + optional L2) with
 * single-flight.
 *
 * Difference from `cached()`: a value stays *served* for `swrMs` after its
 * `ttlMs` freshness window expires. During that stale window the cached value
 * is returned IMMEDIATELY and a background refresh is kicked off (deduped), so
 * no request ever blocks on the expensive loader once the key is warm. Only a
 * cold key (never computed, or idle past `ttlMs + swrMs`) pays the synchronous
 * loader cost, and concurrent cold callers still share one invocation.
 *
 * This is the fix for the "feed skeleton hangs" tail: the per-viewer feed cache
 * previously blocked the first caller after every short TTL on a full ~32-query
 * assemble, and the anon path (raw apiCache) had no single-flight at all, so a
 * burst of visitors on TTL expiry each ran the assemble at once. With SWR the
 * skeleton resolves from cache in ~1ms and the assemble runs off the hot path.
 *
 * Values are stored wrapped as `{ v, freshUntil }`; the L1/L2 hard TTL is
 * `ttlMs + swrMs` so the entry survives into the stale window. `cachedSWR` is
 * the sole reader/writer of its keys, so use a key namespace distinct from any
 * `cached()` key (the wrapper shape differs). Background-refresh failures are
 * swallowed — the last good value keeps serving until it hard-expires.
 */
interface SWREntry<T> {
  v: T;
  freshUntil: number;
}

const swrInflight = new Map<string, Promise<unknown>>();

export interface CachedSWROptions {
  /** Freshness window (ms): within this, the value is returned with no refresh. */
  ttlMs: number;
  /** Extra window (ms) after `ttlMs` during which the stale value is served
   *  while a background refresh runs. */
  swrMs: number;
  /** Also consult/populate the shared Redis L2. Default true. */
  l2?: boolean;
}

/** Recompute `key` and rewrite both cache layers. Deduped via `swrInflight`;
 *  never rejects (a failed refresh keeps the existing stale value). */
function swrRefresh<T>(
  key: string,
  opts: CachedSWROptions,
  loader: () => Promise<T>,
): Promise<T | undefined> {
  const existing = swrInflight.get(key);
  if (existing) return existing as Promise<T | undefined>;
  const useL2 = opts.l2 !== false;
  const hardTtl = opts.ttlMs + opts.swrMs;
  const promise = (async () => {
    try {
      const value = await loader();
      const entry: SWREntry<T> = { v: value, freshUntil: Date.now() + opts.ttlMs };
      apiCache.set(key, entry, hardTtl);
      if (useL2 && redisEnabled()) void redisSetJSON(key, entry, hardTtl);
      return value;
    } catch {
      // Keep the stale value; it will keep serving until it hard-expires.
      return undefined;
    } finally {
      swrInflight.delete(key);
    }
  })();
  swrInflight.set(key, promise);
  return promise;
}

export async function cachedSWR<T>(
  key: string,
  opts: CachedSWROptions,
  loader: () => Promise<T>,
): Promise<T> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;
  const hardTtl = opts.ttlMs + opts.swrMs;

  // L1 — fresh returns immediately; stale returns immediately + refreshes.
  const local = apiCache.get<SWREntry<T>>(key);
  if (local && typeof local === 'object' && 'freshUntil' in local) {
    if (Date.now() >= local.freshUntil) void swrRefresh(key, opts, loader);
    return local.v;
  }

  // L1 miss — coalesce concurrent cold callers onto one resolution.
  const existing = swrInflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      // L2 — a warm value from another worker/instance seeds L1; if it is
      // already stale, serve it and refresh in the background.
      if (useL2 && redisEnabled()) {
        const remote = await redisGetJSON<SWREntry<T>>(key);
        if (remote && typeof remote === 'object' && 'freshUntil' in remote) {
          apiCache.set(key, remote, hardTtl);
          if (Date.now() >= remote.freshUntil) void swrRefresh(key, opts, loader);
          return remote.v;
        }
      }
      // Cold — compute synchronously (this is the only blocking path).
      const value = await loader();
      const entry: SWREntry<T> = { v: value, freshUntil: Date.now() + opts.ttlMs };
      apiCache.set(key, entry, hardTtl);
      if (useL2 && redisEnabled()) void redisSetJSON(key, entry, hardTtl);
      return value;
    } finally {
      swrInflight.delete(key);
    }
  })();

  swrInflight.set(key, promise);
  return promise;
}

/**
 * Drop a single key from L1 + L2 and broadcast the drop to every instance.
 * Call after a mutation that changes the cached value.
 */
export async function invalidateCached(key: string): Promise<void> {
  apiCache.invalidate(key);
  if (redisEnabled()) {
    await redisDel(key);
    redisPublish(INVALIDATION_CHANNEL, { type: 'key', key } satisfies InvalidationMessage);
  }
}

/**
 * Drop every key under a prefix from L1 (+ broadcast). NOTE: L2 keys under the
 * prefix are left to expire by TTL (Redis has no cheap prefix delete); the
 * broadcast still clears every instance's L1 immediately. Use short L2 TTLs on
 * prefix-invalidated families.
 */
export async function invalidateCachedPrefix(prefix: string): Promise<void> {
  apiCache.invalidatePrefix(prefix);
  if (redisEnabled()) {
    redisPublish(INVALIDATION_CHANNEL, { type: 'prefix', prefix } satisfies InvalidationMessage);
  }
}
