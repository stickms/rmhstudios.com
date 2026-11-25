/**
 * THE cache helper — server-only. One module, one vocabulary:
 *
 *   cached(key, ttl, loader, { tags, l2 })   async read-through: L1 (in-process) -> L2 (Redis) -> loader,
 *                                            single-flight on misses, invalidation broadcast to every process
 *   cachedNullable / cachedMiss / cachedMany / cachedSWR   the same, for absent rows, batches, stale-while-revalidate
 *   invalidateCached(key) / invalidateCachedPrefix(p) / invalidateTag(tag)   drop here AND in every other process
 *   lruL1(name, opts)                        an explicitly in-process, SYNC, bounded TTL cache (see below)
 *
 * This module replaced `lib/cache.ts` (`apiCache`, deleted). Entries in the shared L1 are plain JS values; entries
 * that also reach Redis (L2) are JSON round-tripped, so a value holding a Date / Map / class instance / function
 * must pass `l2: false` (it still gets the L1, the single-flight and the cross-process invalidation).
 *
 * With more than one web instance a per-process cache drifts and a local `delete` only clears the local copy. This
 * module therefore layers Redis underneath so that:
 *   - a value warmed on instance A is visible to instance B (L2 hit), and
 *   - an invalidation on any instance is broadcast to all instances (pub/sub), so every L1 copy is dropped.
 * When `REDIS_URL` is unset everything degrades to plain in-process behaviour, so single-instance / local dev is
 * unaffected.
 *
 * ### When to use `lruL1` instead of `cached`
 * `lruL1(name)` is the escape hatch for state that must stay in THIS process: a per-process throttle / probe flag, a
 * value the caller needs synchronously, or something not worth (or not able to survive) a JSON + Redis round trip.
 * It never touches Redis and never broadcasts. Every use is named and says why in a comment at the call site.
 *
 * Usage:
 *   const tier = await cached(`entitlements:tier:${userId}`, 60_000, () => resolveTierFromDb(userId));
 *   // after a change:
 *   await invalidateCached(`entitlements:tier:${userId}`);
 *   // a family of keys:
 *   await cached(`feed:${id}`, 30_000, load, { tags: ['feed'], l2: false });
 *   void invalidateTag('feed');
 */

import { registerCacheBridgeStarter, requestCacheBridge } from '@/lib/cache-bridge-start';
import { measure } from '@/lib/otel/timing';
import { cacheNamespace, recordCache } from '@/lib/perf/process-metrics';
import {
  redisCacheMGet,
  redisEnabled,
  redisGetJSON,
  redisSetJSON,
  redisDel,
  redisPublish,
  redisSubscribe,
} from '@/lib/redis.server';

/* ─── In-process store (the L1 engine) ──────────────────────────────────────── */

/** Identifies this process in invalidation messages so it can ignore its own echo. */
export const CACHE_PROCESS_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

// The L1 engine itself lives in `lib/cache-l1.ts` (plain code a socket hub can import too); this module re-exports it.
import { heapShare, LruL1 } from '@/lib/cache-l1';
export { estimateBytes, heapShare, LruL1, lruL1, type LruL1Options } from '@/lib/cache-l1';

/** Shares of the heap the two shared L1 stores may fill; together 12%, leaving the rest to rendering and requests. */
export const MAIN_CACHE_HEAP_SHARE = 0.08;
export const VIEWER_FEED_CACHE_HEAP_SHARE = 0.04;

/**
 * perf: per-viewer signed-in feed pages (`feed:v3:*`, one per user x surface x filter, tens of KB each) get their own
 * small store so a burst of distinct viewers can never evict the global hot keys (anon SWR feed, sidebar:*) from the
 * main one. Routed by key prefix inside the shared L1, so `cached` callers use one API.
 */
export const viewerFeedL1 = new LruL1({
  maxEntries: 1000,
  maxBytes: heapShare(VIEWER_FEED_CACHE_HEAP_SHARE, 24 * 1024 * 1024),
});
/**
 * The key prefix that routes into `viewerFeedL1`. `lib/feed/timeline.ts` builds its signed-in page keys from this
 * constant, so the router and the producer cannot drift apart (they did: the producer moved to `v3`, the router
 * stayed on `v2`, and every viewer page landed in the main LRU). Bump it here only; a test asserts a real timeline
 * page lands in `viewerFeedL1`.
 */
export const VIEWER_FEED_PREFIX = 'feed:v3:';

/** Main shared L1 (global keys + everything else): 5000 entries, 8% of the heap (at most 64 MB). */
export const mainL1 = new LruL1({
  maxEntries: 5000,
  maxBytes: heapShare(MAIN_CACHE_HEAP_SHARE, 64 * 1024 * 1024),
});

const pick = (key: string) => (key.startsWith(VIEWER_FEED_PREFIX) ? viewerFeedL1 : mainL1);

/** The shared L1 `cached*()` read and write; facade over `mainL1` + `viewerFeedL1`. */
const l1 = {
  get: <T>(key: string): T | undefined => pick(key).get<T>(key),
  set: <T>(key: string, value: T, ttlMs: number, sizeBytes?: number): void =>
    pick(key).set(key, value, ttlMs, sizeBytes),
  has: (key: string): boolean => pick(key).has(key),
  drop: (key: string): void => pick(key).delete(key),
  dropPrefix: (prefix: string): void => {
    mainL1.deletePrefix(prefix);
    viewerFeedL1.deletePrefix(prefix);
  },
};

/**
 * Synchronous read of the shared L1 ONLY (no Redis, no loader, no single-flight).
 * For a caller that owns its own second layer (e.g. a bespoke Redis key with its own serialisation) and just wants
 * the shared, bounded, TTL-swept in-process store. Everything else should call `cached()`.
 */
export function peekL1<T>(key: string): T | undefined {
  return l1.get<T>(key);
}

/** Synchronous write to the shared L1 ONLY. Pair with `peekL1`; `invalidateCached(key)` drops it everywhere. */
export function putL1<T>(key: string, value: T, ttlMs: number, tags?: readonly string[]): void {
  l1.set(key, value, ttlMs);
  if (tags && tags.length > 0) fileUnderTags(key, tags);
}

/** Total entries in the shared L1 (monitoring / tests). */
export function sharedL1Size(): number {
  return mainL1.size + viewerFeedL1.size;
}

/** Pub/sub channel carrying "drop this key / prefix everywhere" messages. */
const INVALIDATION_CHANNEL = 'cache:invalidate';

/**
 * `origin` is the sender's process id, so a process ignores its own echo (it has
 * already dropped the key locally, and dropping again could discard a value it
 * reloaded in between). Messages without one (older deploys during a blue/green
 * swap) are applied by everyone.
 */
type InvalidationMessage = (
  { type: 'key'; key: string } | { type: 'prefix'; prefix: string } | { type: 'tag'; tag: string }
) & {
  origin?: string;
};

type InflightRecord = {
  promise: Promise<unknown> | null;
  invalidated: boolean;
  /** Tags the load will be stored under, so `invalidateTag` can detach it. */
  tags?: readonly string[];
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
  // dropLocal, not invalidate: this runs both on the writer and on a remote
  // receipt, and `invalidate` would re-publish (an echo loop between processes).
  l1.drop(key);
}

function invalidateLocalPrefix(prefix: string): void {
  detachFlightsWithPrefix(inflight, prefix);
  detachFlightsWithPrefix(swrInflight, prefix);
  l1.dropPrefix(prefix);
}

/* ─── Tags ───────────────────────────────────────────────────────────────────
 *
 * `cached(key, ttl, load, { tags })` files the key under each tag in a local index; `invalidateTag(tag)` drops every
 * key filed under it, in every process (the message is `{ type: 'tag' }` on the same channel). It replaces
 * prefix-matching for key families whose members do not share a literal prefix, and for "this write affects these
 * reads" relationships that were implicit in naming.
 *
 * Tagged entries are L1-only (L2 is skipped): Redis has no cheap "delete by tag", and an L2 copy left behind would be
 * re-read straight after the invalidation. L1 + the broadcast is exact; the cost is that a tagged value is not shared
 * across processes, only coherent between them.
 */
const tagIndex = new Map<string, Set<string>>();
const TAG_PRUNE_AT = 2048;

function fileUnderTags(key: string, tags: readonly string[]): void {
  for (const tag of tags) {
    let keys = tagIndex.get(tag);
    if (!keys) tagIndex.set(tag, (keys = new Set()));
    keys.add(key);
    if (keys.size > TAG_PRUNE_AT) {
      // Keys evicted or expired from L1 stay in the index until now; forget them so the index is bounded by L1.
      for (const k of keys) if (!l1.has(k)) keys.delete(k);
    }
  }
}

function invalidateLocalTag(tag: string): void {
  const keys = tagIndex.get(tag);
  tagIndex.delete(tag);
  if (keys) for (const key of keys) invalidateLocalKey(key);
  // A load still in flight that has not stored yet (so is not in the index).
  for (const flights of [inflight, swrInflight]) {
    for (const [key, flight] of flights) {
      if (!flight.tags?.includes(tag)) continue;
      flight.invalidated = true;
      flights.delete(key);
    }
  }
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
    if (msg.origin === CACHE_PROCESS_ID) return;
    if (msg.type === 'key' && typeof msg.key === 'string') {
      invalidateLocalKey(msg.key);
    } else if (msg.type === 'prefix' && typeof msg.prefix === 'string') {
      invalidateLocalPrefix(msg.prefix);
    } else if (msg.type === 'tag' && typeof msg.tag === 'string') {
      invalidateLocalTag(msg.tag);
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
  /**
   * Invalidation tags for this key (`invalidateTag`). Tagged entries are L1-only: `l2` is ignored (see the Tags
   * section) so an invalidation is exact in every process.
   */
  tags?: readonly string[];
}

/**
 * Read-through cache: L1 (in-process) → L2 (Redis) → loader. Warms both layers
 * on a miss. Concurrent callers within a process share one loader invocation
 * via an in-flight promise map (prevents a local stampede).
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: CachedOptions = {},
): Promise<T> {
  // `cache` Server-Timing phase: the whole call, so an L1 hit reports its ~0 ms
  // and a miss carries the loader (and therefore overlaps `db`). Nested
  // `cached()` calls inside a loader are counted again by design — the phase is
  // "time spent behind the cache layer", not an exclusive slice of `total`.
  return measure('cache', () => cachedUntimed(key, ttlMs, loader, opts));
}

async function cachedUntimed<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: CachedOptions,
): Promise<T> {
  ensureSubscribed();
  const tags = opts.tags && opts.tags.length > 0 ? opts.tags : undefined;
  const useL2 = opts.l2 !== false && !tags;
  const ttlOf = (value: unknown): number => opts.ttlFor?.(value) ?? ttlMs;

  // L1
  const local = l1.get<T>(key);
  if (local !== undefined) {
    recordCache('l1_hit', cacheNamespace(key));
    return local;
  }

  // Coalesce concurrent local callers.
  const existing = inflight.get(key)?.promise;
  if (existing) return existing as Promise<T>;

  const flight: InflightRecord = { promise: null, invalidated: false, tags };
  const promise = (async () => {
    try {
      // L2
      if (useL2 && redisEnabled()) {
        const remote = await redisGetJSON<T>(key);
        if (remote !== null && remote !== undefined) {
          recordCache('l2_hit', cacheNamespace(key));
          if (isCurrentFlight(inflight, key, flight)) {
            // `ttlOf` and not `ttlMs`: seeding L1 from L2 must not promote a
            // cached miss to the (much longer) positive TTL.
            l1.set(key, remote, ttlOf(remote));
          }
          return remote;
        }
      }
      // Loader
      recordCache('miss', cacheNamespace(key));
      const value = await loader();
      const store = opts.shouldCache ? opts.shouldCache(value) : true;
      if (store && isCurrentFlight(inflight, key, flight)) {
        l1.set(key, value, ttlOf(value));
        if (tags) fileUnderTags(key, tags);
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
  /** Invalidation tags (see `CachedOptions.tags`; implies L1-only). */
  tags?: readonly string[];
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
  const stored = await cached<T | NegativeEntry>(
    key,
    ttlMs,
    async () => (await loader()) ?? NEGATIVE,
    {
      l2: opts.l2,
      tags: opts.tags,
      ttlFor: (value) => (isNegative(value) ? negativeTtlMs : ttlMs),
    },
  );
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
export function cachedMiss<T>(
  key: string,
  loader: () => Promise<T | null | undefined>,
  opts: { l2?: boolean; negativeTtlMs?: number } = {},
): Promise<T | null> {
  return measure('cache', () => cachedMissUntimed(key, loader, opts));
}

async function cachedMissUntimed<T>(
  key: string,
  loader: () => Promise<T | null | undefined>,
  opts: { l2?: boolean; negativeTtlMs?: number },
): Promise<T | null> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;
  const ttlMs = opts.negativeTtlMs ?? NEGATIVE_TTL_MS;

  if (isNegative(l1.get(key))) {
    recordCache('l1_hit', cacheNamespace(key));
    return null;
  }
  if (useL2 && redisEnabled()) {
    const remote = await redisGetJSON<unknown>(key);
    if (isNegative(remote)) {
      recordCache('l2_hit', cacheNamespace(key));
      l1.set(key, remote, ttlMs);
      return null;
    }
  }

  recordCache('miss', cacheNamespace(key));
  const value = await loader();
  if (value !== null && value !== undefined) return value;

  l1.set(key, NEGATIVE, ttlMs);
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
export function cachedMany<T>(
  keys: string[],
  ttlMs: number,
  loadMissing: (missing: string[]) => Promise<Map<string, T | null | undefined>>,
  opts: CachedManyOptions = {},
): Promise<Map<string, T>> {
  return measure('cache', () => cachedManyUntimed(keys, ttlMs, loadMissing, opts));
}

async function cachedManyUntimed<T>(
  keys: string[],
  ttlMs: number,
  loadMissing: (missing: string[]) => Promise<Map<string, T | null | undefined>>,
  opts: CachedManyOptions,
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
    const local = l1.get<unknown>(key);
    if (local === undefined) missing.push(key);
    else {
      recordCache('l1_hit', cacheNamespace(key));
      if (!isNegative(local)) found.set(key, local as T);
    }
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
      recordCache('l2_hit', cacheNamespace(key));
      l1.set(key, value, ttlOf(value));
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

  for (const key of missing) recordCache('miss', cacheNamespace(key));
  try {
    const loaded = await loadMissing(missing);
    for (const key of missing) {
      const value = loaded.get(key);
      const stored: unknown = value === null || value === undefined ? NEGATIVE : value;
      if (value !== null && value !== undefined) found.set(key, value);

      const flight = claimed.get(key);
      if (!flight || !isCurrentFlight(inflight, key, flight)) continue;
      l1.set(key, stored, ttlOf(stored));
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
 * assemble, and the anon path (a raw in-process cache) had no single-flight at all, so a
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
        l1.set(key, entry, hardTtl);
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

export function cachedSWR<T>(
  key: string,
  opts: CachedSWROptions,
  loader: () => Promise<T>,
): Promise<T> {
  return measure('cache', () => cachedSWRUntimed(key, opts, loader));
}

async function cachedSWRUntimed<T>(
  key: string,
  opts: CachedSWROptions,
  loader: () => Promise<T>,
): Promise<T> {
  ensureSubscribed();
  const useL2 = opts.l2 !== false;
  const hardTtl = opts.ttlMs + opts.swrMs;

  // L1 — fresh returns immediately; stale returns immediately + refreshes.
  const local = l1.get<SWREntry<T>>(key);
  if (local && typeof local === 'object' && 'freshUntil' in local) {
    if (Date.now() >= local.freshUntil) {
      recordCache('stale', cacheNamespace(key));
      void swrRefresh(key, opts, loader);
    } else {
      recordCache('l1_hit', cacheNamespace(key));
    }
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
          recordCache(Date.now() >= remote.freshUntil ? 'stale' : 'l2_hit', cacheNamespace(key));
          if (isCurrentFlight(swrInflight, key, flight)) {
            l1.set(key, remote, hardTtl);
            if (Date.now() >= remote.freshUntil) void swrRefresh(key, opts, loader);
          }
          return remote.v;
        }
      }
      // Cold — compute synchronously (this is the only blocking path).
      recordCache('miss', cacheNamespace(key));
      const value = await loader();
      const entry: SWREntry<T> = { v: value, freshUntil: Date.now() + opts.ttlMs };
      if (isCurrentFlight(swrInflight, key, flight)) {
        l1.set(key, entry, hardTtl);
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
  ensureSubscribed();
  invalidateLocalKey(key);
  if (redisEnabled()) {
    await redisDel(key);
    redisPublish(INVALIDATION_CHANNEL, {
      type: 'key',
      key,
      origin: CACHE_PROCESS_ID,
    } satisfies InvalidationMessage);
  }
}

/**
 * Drop every key under a prefix from L1 (+ broadcast). NOTE: L2 keys under the
 * prefix are left to expire by TTL (Redis has no cheap prefix delete); the
 * broadcast still clears every instance's L1 immediately. A prefix-invalidated
 * family must therefore be cached with `l2: false` (or short L2 TTLs), or the next
 * read re-seeds L1 from the stale L2 copy. Prefer tags for new families.
 * The local drop is synchronous, so a sync caller may `void` the promise.
 */
export async function invalidateCachedPrefix(prefix: string): Promise<void> {
  ensureSubscribed();
  invalidateLocalPrefix(prefix);
  if (redisEnabled()) {
    redisPublish(INVALIDATION_CHANNEL, {
      type: 'prefix',
      prefix,
      origin: CACHE_PROCESS_ID,
    } satisfies InvalidationMessage);
  }
}

/**
 * Drop every key filed under `tag` (see `CachedOptions.tags`) here and in every other process. The local drop is
 * synchronous; the promise exists for symmetry with the other invalidators (a sync caller may `void` it).
 */
export async function invalidateTag(tag: string): Promise<void> {
  ensureSubscribed();
  invalidateLocalTag(tag);
  if (redisEnabled()) {
    redisPublish(INVALIDATION_CHANNEL, {
      type: 'tag',
      tag,
      origin: CACHE_PROCESS_ID,
    } satisfies InvalidationMessage);
  }
}

/**
 * Subscribe to the invalidation channel. Idempotent.
 *
 * Importing this module opens NO Redis connection (a short-lived script that imports it must exit).
 * The subscription starts lazily on the first `cached*()` / `invalidate*()` call. A process that only ever
 * READS an L1 entry before any such call would never trigger that, so long-running servers start it at boot:
 * the web tier through `requestCacheBridge` in `server/nitro/cache-bridge.ts`, which reaches this module's copy
 * in the app bundle.
 */
export function startCacheBridge(): void {
  requestCacheBridge();
  ensureSubscribed();
}

// Every bundled copy of this module registers, so start-up reaches the copy the
// requests actually use (lib/cache-bridge-start.ts).
registerCacheBridgeStarter(ensureSubscribed);
