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
  redisCacheMGet,
  redisEnabled,
  redisGetJSON,
  redisSetJSON,
  redisDel,
  redisPublish,
  redisSubscribe,
} from '@/lib/redis.server';

/** Pub/sub channel carrying "drop this key / prefix everywhere" messages. */
const INVALIDATION_CHANNEL = 'cache:invalidate';

type InvalidationMessage = { type: 'key'; key: string } | { type: 'prefix'; prefix: string };

type InflightRecord = {
  promise: Promise<unknown> | null;
  invalidated: boolean;
};

const inflight = new Map<string, InflightRecord>();
const swrInflight = new Map<string, InflightRecord>();

function isCurrentFlight(
  flights: Map<string, InflightRecord>,
  key: string,
  flight: InflightRecord,
): boolean {
  return !flight.invalidated && flights.get(key) === flight;
}

function detachFlight(flights: Map<string, InflightRecord>, key: string): void {
  const flight = flights.get(key);
  if (!flight) return;
  flight.invalidated = true;
  flights.delete(key);
}

function detachFlightsWithPrefix(flights: Map<string, InflightRecord>, prefix: string): void {
  for (const [key, flight] of flights) {
    if (!key.startsWith(prefix)) continue;
    flight.invalidated = true;
    flights.delete(key);
  }
}

/**
 * Drop local cache state and detach any older computation for `key`. Detaching
 * lets the next caller start a fresh load immediately; the old promise still
 * resolves for its original callers, but can no longer repopulate the cache.
 */
function invalidateLocalKey(key: string): void {
  detachFlight(inflight, key);
  detachFlight(swrInflight, key);
  apiCache.invalidate(key);
}

function invalidateLocalPrefix(prefix: string): void {
  detachFlightsWithPrefix(inflight, prefix);
  detachFlightsWithPrefix(swrInflight, prefix);
  apiCache.invalidatePrefix(prefix);
}

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
      invalidateLocalKey(msg.key);
    } else if (msg.type === 'prefix' && typeof msg.prefix === 'string') {
      invalidateLocalPrefix(msg.prefix);
    }
  });
}

/* ─── Negative caching (OPT-47) ──────────────────────────────────────────────
 *
 * A 404-shaped request is the cheapest thing here to cache and the most likely
 * to repeat: crawlers, dead links, and everyone still following a link to a
 * deleted profile. Without a notion of "we looked, and there is nothing", every
 * one of those goes to Postgres, every time.
 */

/**
 * Marker for a cached miss.
 *
 * A plain STRING property, deliberately not the `Symbol.for('rmh.cache.negative')`
 * the design sketch reached for: the sentinel has to survive
 * `JSON.stringify` → Redis → `JSON.parse` or L2 negative caching does not exist.
 * `JSON.stringify` drops symbol-keyed properties silently, and the in-process L1
 * (a plain Map, no serialization) would keep working — so a symbol sentinel
 * fails in exactly the way that looks fine locally and does nothing in
 * production.
 */
const NEGATIVE_MARKER = '__rmhCacheNegative__';

interface NegativeEntry {
  __rmhCacheNegative__: true;
}

/** The single stored value meaning "there is nothing here". */
const NEGATIVE: NegativeEntry = { __rmhCacheNegative__: true };

/**
 * How long a miss is remembered. **Much shorter than any hit's TTL, and that
 * asymmetry is the whole design.** A missing row is far more likely to become
 * present (someone signs up, claims the handle, publishes the post) than a
 * present row is to change, so a negative TTL borrowed from the positive side
 * is how a just-created resource 404s for minutes after it exists. This is a
 * stampede guard, not a cache.
 */
export const NEGATIVE_TTL_MS = 10_000;

/**
 * Is this stored value a cached miss?
 *
 * The `keys.length === 1` check keeps a real payload that happens to carry a
 * field of the same name from being read as a miss — the sentinel is the whole
 * object or it is not the sentinel.
 */
function isNegative(value: unknown): value is NegativeEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[NEGATIVE_MARKER] === true &&
    Object.keys(value).length === 1
  );
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
  /**
   * TTL for the value actually produced, overriding `ttlMs`. Exists for the
   * negative cache: a miss must expire in seconds while a hit lives for
   * minutes, and which one we have can only be known after the loader answers
   * (or after L2 hands the value back).
   */
  ttlFor?: (value: unknown) => number;
}

/**
 * Read-through cache: L1 (in-process) → L2 (Redis) → loader. Warms both layers
 * on a miss. Concurrent callers within a process share one loader invocation
 * via an in-flight promise map (prevents a local stampede).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: CachedOptions = {},
): Promise<T> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;
  const ttlOf = (value: unknown): number => opts.ttlFor?.(value) ?? ttlMs;

  // L1
  const local = apiCache.get<T>(key);
  if (local !== undefined) return local;

  // Coalesce concurrent local callers.
  const existing = inflight.get(key)?.promise;
  if (existing) return existing as Promise<T>;

  const flight: InflightRecord = { promise: null, invalidated: false };
  const promise = (async () => {
    try {
      // L2
      if (useL2 && redisEnabled()) {
        const remote = await redisGetJSON<T>(key);
        if (remote !== null && remote !== undefined) {
          if (isCurrentFlight(inflight, key, flight)) {
            // `ttlOf` and not `ttlMs`: seeding L1 from L2 must not promote a
            // cached miss to the (much longer) positive TTL.
            apiCache.set(key, remote, ttlOf(remote));
          }
          return remote;
        }
      }
      // Loader
      const value = await loader();
      const store = opts.shouldCache ? opts.shouldCache(value) : true;
      if (store && isCurrentFlight(inflight, key, flight)) {
        apiCache.set(key, value, ttlOf(value));
        if (useL2 && redisEnabled()) {
          // Best-effort; don't block on the write.
          void redisSetJSON(key, value, ttlOf(value));
        }
      }
      return value;
    } finally {
      // An invalidation may have detached this flight and installed a newer
      // one. Only the record that is still current may remove itself.
      if (inflight.get(key) === flight) inflight.delete(key);
    }
  })();

  flight.promise = promise;
  inflight.set(key, flight);
  return promise;
}

export interface CachedNullableOptions {
  /** Also consult/populate the shared Redis L2. Default true. */
  l2?: boolean;
  /**
   * How long a miss is remembered. Defaults to `NEGATIVE_TTL_MS` and is clamped
   * to `ttlMs`, so a caller cannot accidentally remember an absence for longer
   * than it would have remembered a value.
   */
  negativeTtlMs?: number;
}

/**
 * `cached()` for a lookup that can legitimately answer "nothing" — the miss is
 * cached too, under the short negative TTL (see `NEGATIVE_TTL_MS`).
 *
 * Everything else is `cached()`: same L1 → L2 → loader order, same single-flight
 * coalescing, same pub/sub invalidation. `invalidateCached(key)` clears a
 * negative entry exactly like a positive one.
 *
 * Only for **viewer-independent** lookups, because the result is shared: "does
 * this handle exist" qualifies, "this profile as seen by this viewer" does not
 * (use `cachedMiss` for that).
 *
 * ### The rule that comes with it
 * Creating the thing must invalidate its negative entry. Every create path with
 * a corresponding lookup calls `invalidateCached(sameKey)`, or the lookup does
 * not get migrated — otherwise "I just made it and it says not found" becomes a
 * support ticket, and a short TTL only shortens the ticket.
 */
export async function cachedNullable<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T | null | undefined>,
  opts: CachedNullableOptions = {},
): Promise<T | null> {
  const negativeTtlMs = Math.min(opts.negativeTtlMs ?? NEGATIVE_TTL_MS, ttlMs);
  const stored = await cached<T | NegativeEntry>(key, ttlMs, async () => (await loader()) ?? NEGATIVE, {
    l2: opts.l2,
    ttlFor: (value) => (isNegative(value) ? negativeTtlMs : ttlMs),
  });
  return isNegative(stored) ? null : (stored as T);
}

/**
 * Cache **only the absence**. A hit is returned straight through: never stored,
 * never coalesced.
 *
 * For lookups whose "found" answer is unsafe to share but whose "not found"
 * answer is universal — a profile row carrying the viewer's follow state, a
 * document annotated with the reader's permissions. Two things follow from that
 * asymmetry and both matter:
 *
 *  - **No write-through.** Caching the hit would serve one viewer's annotated
 *    row to another.
 *  - **No single-flight.** `cached()` coalesces concurrent callers of a key onto
 *    one loader invocation, which for a viewer-dependent loader means handing
 *    viewer B the object built for viewer A. So this deliberately runs the
 *    loader per caller; the only thing shared is the sentinel.
 *
 * The payoff is the same as `cachedNullable`'s and lands on the same traffic:
 * the 404 costs its queries once per negative TTL instead of once per request,
 * while the hit path keeps exactly the query shape it had.
 *
 * The same create-path rule applies — see `cachedNullable`.
 */
export async function cachedMiss<T>(
  key: string,
  loader: () => Promise<T | null | undefined>,
  opts: { l2?: boolean; negativeTtlMs?: number } = {},
): Promise<T | null> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;
  const ttlMs = opts.negativeTtlMs ?? NEGATIVE_TTL_MS;

  if (isNegative(apiCache.get(key))) return null;
  if (useL2 && redisEnabled()) {
    const remote = await redisGetJSON<unknown>(key);
    if (isNegative(remote)) {
      apiCache.set(key, remote, ttlMs);
      return null;
    }
  }

  const value = await loader();
  if (value !== null && value !== undefined) return value;

  apiCache.set(key, NEGATIVE, ttlMs);
  if (useL2 && redisEnabled()) void redisSetJSON(key, NEGATIVE, ttlMs);
  return null;
}

export interface CachedManyOptions {
  /** Also consult/populate the shared Redis L2. Default true. */
  l2?: boolean;
  /** How long a miss is remembered. Defaults to `NEGATIVE_TTL_MS`, clamped to `ttlMs`. */
  negativeTtlMs?: number;
}

/**
 * Read-through cache for a whole set of keys at once (OPT-48): L1 for all of
 * them → **one** Redis `MGET` for the L1 misses → **one** `loadMissing` call for
 * whatever is still missing.
 *
 * `cached()` inside a `Promise.all` looks batched and is not — each key makes
 * its own Redis round trip. That is the shape `getUserDisplayMap` had, and it is
 * how the anonymous homepage came to issue ~40 separate L2 reads for one page
 * (see the `enableOfflineQueue` comment in `lib/redis.server.ts`). It also puts
 * the layers in the wrong order when the origin load is batched separately: the
 * database gets asked for keys that Redis was holding.
 *
 * Negative-aware: a key `loadMissing` returns no value for is stored as a miss
 * under the short negative TTL, so a dead id stops widening the loader's
 * `IN (…)` list on every request. Returns a Map of the keys that HAVE a value;
 * cached misses are simply absent from it.
 *
 * Concurrency: there is no single-flight here — `loadMissing` is already the
 * batched call two overlapping requests would otherwise each make N times. What
 * is preserved is the invalidation race that `cached()` guards: each key this
 * call intends to write back is claimed in the shared in-flight map, and an
 * `invalidateCached()` landing mid-load detaches the claim so the stale value is
 * not written back afterwards. Keys already claimed by a concurrent `cached()`
 * are still returned to this caller but left for that caller to write.
 */
export async function cachedMany<T>(
  keys: string[],
  ttlMs: number,
  loadMissing: (missing: string[]) => Promise<Map<string, T | null | undefined>>,
  opts: CachedManyOptions = {},
): Promise<Map<string, T>> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;
  const negativeTtlMs = Math.min(opts.negativeTtlMs ?? NEGATIVE_TTL_MS, ttlMs);
  const ttlOf = (value: unknown): number => (isNegative(value) ? negativeTtlMs : ttlMs);

  const found = new Map<string, T>();
  const unique = [...new Set(keys)];
  if (unique.length === 0) return found;

  // L1 — free, and usually most of the batch.
  let missing: string[] = [];
  for (const key of unique) {
    const local = apiCache.get<unknown>(key);
    if (local === undefined) missing.push(key);
    else if (!isNegative(local)) found.set(key, local as T);
  }

  // L2 — ONE round trip for the entire L1 miss set.
  if (useL2 && missing.length > 0 && redisEnabled()) {
    const remote = await redisCacheMGet<unknown>(missing);
    const stillMissing: string[] = [];
    for (let i = 0; i < missing.length; i++) {
      const key = missing[i];
      const value = remote[i];
      if (value === undefined) {
        stillMissing.push(key);
        continue;
      }
      apiCache.set(key, value, ttlOf(value));
      if (!isNegative(value)) found.set(key, value as T);
    }
    missing = stillMissing;
  }
  if (missing.length === 0) return found;

  // Claim the write-back for the keys nobody else is already loading, so a
  // concurrent invalidation can detach us (and so we don't stomp a `cached()`
  // flight that owns the key). The claim carries no promise: joining a batch
  // mid-flight would hand a `cached()` caller the raw stored value, sentinel
  // and all.
  const claimed = new Map<string, InflightRecord>();
  for (const key of missing) {
    if (inflight.has(key)) continue;
    const flight: InflightRecord = { promise: null, invalidated: false };
    inflight.set(key, flight);
    claimed.set(key, flight);
  }

  try {
    const loaded = await loadMissing(missing);
    for (const key of missing) {
      const value = loaded.get(key);
      const stored: unknown = value === null || value === undefined ? NEGATIVE : value;
      if (value !== null && value !== undefined) found.set(key, value);

      const flight = claimed.get(key);
      if (!flight || !isCurrentFlight(inflight, key, flight)) continue;
      apiCache.set(key, stored, ttlOf(stored));
      if (useL2 && redisEnabled()) void redisSetJSON(key, stored, ttlOf(stored));
    }
  } finally {
    for (const [key, flight] of claimed) {
      if (inflight.get(key) === flight) inflight.delete(key);
    }
  }

  return found;
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
  const existing = swrInflight.get(key)?.promise;
  if (existing) return existing as Promise<T | undefined>;
  const useL2 = opts.l2 !== false;
  const hardTtl = opts.ttlMs + opts.swrMs;
  const flight: InflightRecord = { promise: null, invalidated: false };
  const promise = (async () => {
    try {
      const value = await loader();
      const entry: SWREntry<T> = { v: value, freshUntil: Date.now() + opts.ttlMs };
      if (isCurrentFlight(swrInflight, key, flight)) {
        apiCache.set(key, entry, hardTtl);
        if (useL2 && redisEnabled()) void redisSetJSON(key, entry, hardTtl);
      }
      return value;
    } catch {
      // Keep the stale value; it will keep serving until it hard-expires.
      return undefined;
    } finally {
      if (swrInflight.get(key) === flight) swrInflight.delete(key);
    }
  })();
  flight.promise = promise;
  swrInflight.set(key, flight);
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
  const existing = swrInflight.get(key)?.promise;
  if (existing) return existing as Promise<T>;

  const flight: InflightRecord = { promise: null, invalidated: false };
  const promise = (async () => {
    try {
      // L2 — a warm value from another worker/instance seeds L1; if it is
      // already stale, serve it and refresh in the background.
      if (useL2 && redisEnabled()) {
        const remote = await redisGetJSON<SWREntry<T>>(key);
        if (remote && typeof remote === 'object' && 'freshUntil' in remote) {
          if (isCurrentFlight(swrInflight, key, flight)) {
            apiCache.set(key, remote, hardTtl);
            if (Date.now() >= remote.freshUntil) void swrRefresh(key, opts, loader);
          }
          return remote.v;
        }
      }
      // Cold — compute synchronously (this is the only blocking path).
      const value = await loader();
      const entry: SWREntry<T> = { v: value, freshUntil: Date.now() + opts.ttlMs };
      if (isCurrentFlight(swrInflight, key, flight)) {
        apiCache.set(key, entry, hardTtl);
        if (useL2 && redisEnabled()) void redisSetJSON(key, entry, hardTtl);
      }
      return value;
    } finally {
      if (swrInflight.get(key) === flight) swrInflight.delete(key);
    }
  })();

  flight.promise = promise;
  swrInflight.set(key, flight);
  return promise;
}

/**
 * Drop a single key from L1 + L2 and broadcast the drop to every instance.
 * Call after a mutation that changes the cached value.
 *
 * Also the required companion to `cachedNullable`/`cachedMiss`/`cachedMany`:
 * a *create* changes the cached value from "nothing" to something, so a create
 * path is a mutation for this purpose too.
 */
export async function invalidateCached(key: string): Promise<void> {
  invalidateLocalKey(key);
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
  invalidateLocalPrefix(prefix);
  if (redisEnabled()) {
    redisPublish(INVALIDATION_CHANNEL, { type: 'prefix', prefix } satisfies InvalidationMessage);
  }
}
