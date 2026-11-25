/**
 * The in-process L1 engine: a synchronous, bounded TTL + LRU store (`LruL1`, `lruL1()`), its size estimator and the
 * heap-share budget. Plain code with no imports, so a socket hub (which cannot import `cached.server.ts`: it brings
 * Redis, tracing and metrics along) uses the same bounded primitive instead of a hand-rolled TTL map
 * (`lib/__tests__/adhoc-cache-ratchet.test.ts`). `lib/cached.server.ts` re-exports all of it and stays the one cache
 * helper the web tier imports.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  bytes: number;
}

/**
 * Nodes visited by the size estimator before it stops and extrapolates. A signed-in feed page (20 posts with their
 * authors and media) is ~900 nodes; the old budget of 400 stopped half-way and extrapolated only over the entries
 * still on the stack, not their subtrees, so feed pages were undercounted ~1.8× (measured 2026-10-21: 29 KB real,
 * 16 KB estimated). 5000 walks every realistic cached value in full; the walk runs on a cache MISS only.
 */
const ESTIMATE_NODE_BUDGET = 5000;

/*
 * V8's layout on 64-bit Node (no pointer compression), the costs the estimate is built from. Calibrated against
 * `process.memoryUsage().heapUsed` with --expose-gc on representative values (a feed page, a user list, one user):
 * the estimate lands within ~20% of the retained heap for each.
 *   - an object: a header (map, properties, elements) plus one 8-byte slot per own property. Keys live in the
 *     hidden class and are shared by every object of the same shape, so they cost nothing per instance;
 *   - an array: a header plus one slot per element;
 *   - a string: a header plus one byte per char (V8 stores Latin-1 text one byte wide);
 *   - a number: free in its slot when it is a small integer (Smi), else a 16-byte heap number;
 *   - a Date: a small object of its own.
 */
const OBJECT_HEADER = 40;
const ARRAY_HEADER = 40;
const SLOT = 8;
const STRING_HEADER = 20;
const HEAP_NUMBER = 16;
const DATE_BYTES = 48;
const SMI_MAX = 2 ** 30;

/**
 * perf: approximate retained heap size of a cached value WITHOUT JSON.stringify (which would serialize every page
 * on the hot `set` path). Walks up to ESTIMATE_NODE_BUDGET nodes; past that the remainder is extrapolated from the
 * average cost per node so far, scaled by how much of the value is still unvisited. It guards the HEAP (the caches'
 * budgets are a share of the worker's heap limit, see `heapShare`), so it is calibrated to retained bytes, not to
 * serialized size. Callers that already hold a serialized length can pass it to `set`.
 */
export function estimateBytes(value: unknown): number {
  let bytes = 0;
  let visited = 0;
  const stack: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const v = stack.pop();
    visited++;
    if (typeof v === 'string') {
      bytes += STRING_HEADER + v.length;
    } else if (typeof v === 'number') {
      if (!Number.isInteger(v) || Math.abs(v) >= SMI_MAX) bytes += HEAP_NUMBER;
    } else if (v !== null && typeof v === 'object') {
      if (seen.has(v)) continue;
      seen.add(v);
      if (visited >= ESTIMATE_NODE_BUDGET) {
        // Each node still on the stack heads a subtree we have not seen; assume they are like the ones we have.
        bytes += (bytes / visited) * stack.length * 2;
        break;
      }
      if (v instanceof Date) {
        bytes += DATE_BYTES;
      } else if (ArrayBuffer.isView(v)) {
        bytes += OBJECT_HEADER;
        // Views can share a backing allocation; count it once, including bytes
        // retained outside the visible slice of a Buffer or typed array.
        stack.push(v.buffer);
      } else if (
        v instanceof ArrayBuffer ||
        (typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer)
      ) {
        bytes += OBJECT_HEADER + v.byteLength;
      } else if (Array.isArray(v)) {
        bytes += ARRAY_HEADER + SLOT * v.length;
        for (let i = 0; i < v.length; i++) stack.push(v[i]);
      } else {
        bytes += OBJECT_HEADER;
        for (const k of Object.keys(v)) {
          bytes += SLOT;
          stack.push((v as Record<string, unknown>)[k]);
        }
      }
    }
  }
  return Math.ceil(bytes);
}

export interface LruL1Options {
  maxEntries?: number;
  /** Approximate byte budget; least-recently-used entries are evicted past it. */
  maxBytes?: number;
}

/**
 * TTL + true-LRU cache bounded by entry count AND approximate bytes.
 * `Map` iterates in insertion order, so "delete + re-insert on hit" keeps the
 * least-recently-used key first; eviction pops from the front.
 */
export class LruL1 {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private totalBytes = 0;
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  /** Label for `lruL1(name)`; documentation / debugging only. */
  name = 'lru';

  constructor(opts: LruL1Options | number = {}) {
    const o = typeof opts === 'number' ? { maxEntries: opts } : opts;
    this.maxEntries = o.maxEntries ?? 5000;
    this.maxBytes = o.maxBytes ?? 64 * 1024 * 1024;
    if (
      !Number.isSafeInteger(this.maxEntries) ||
      this.maxEntries < 0 ||
      !Number.isFinite(this.maxBytes) ||
      this.maxBytes < 0
    ) {
      throw new RangeError('Cache budgets must be finite and non-negative; maxEntries must be an integer');
    }
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
    if (Date.now() >= entry.expiresAt) {
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
    if (
      this.maxEntries === 0 ||
      this.maxBytes === 0 ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0 ||
      !Number.isFinite(bytes) ||
      bytes < 0 ||
      bytes > this.maxBytes
    )
      return;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, bytes });
    this.totalBytes += bytes;
    // Evict least-recently-used until within both caps (never the new key).
    while (this.store.size > 1 && (this.store.size > this.maxEntries || this.totalBytes > this.maxBytes)) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      this.remove(oldest, this.store.get(oldest));
    }
  }

  private remove(key: string, entry: CacheEntry<unknown> | undefined): void {
    if (this.store.delete(key) && entry) this.totalBytes -= entry.bytes;
  }

  /** Is a live (unexpired) entry stored? Does not refresh recency. */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.remove(key, entry);
      return false;
    }
    return true;
  }

  /** Delete a specific key (e.g. after a mutation) in THIS process only. */
  delete(key: string): void {
    this.remove(key, this.store.get(key));
  }

  /** Delete all keys matching a prefix (e.g. "leaderboard:") in THIS process only. */
  deletePrefix(prefix: string): void {
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) this.remove(key, entry);
    }
  }

  /** Remove all expired entries. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) this.remove(key, entry);
    }
  }

  /** Drop everything (tests). */
  clear(): void {
    this.store.clear();
    this.totalBytes = 0;
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
 * The worker's V8 heap limit (`--max-old-space-size` plus the young generation), or `null` outside Node.
 * `getBuiltinModule` rather than an import, so this module stays importable anywhere.
 */
function heapLimitBytes(): number | null {
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
    const v8 = proc?.getBuiltinModule?.('node:v8') as { getHeapStatistics(): { heap_size_limit: number } } | undefined;
    return v8?.getHeapStatistics().heap_size_limit ?? null;
  } catch {
    return null;
  }
}

/**
 * A cache budget as a SHARE of the worker's heap, capped at `capBytes` (the budget a large heap gets).
 *
 * Why (2026-10-21): the caches had fixed budgets of 64 MB + 24 MB, sized without reference to the heap they live
 * in. Production runs each Nitro worker with --max-old-space-size=384, and the estimator undercounted feed pages
 * ~1.8×, so the two caches could legitimately retain ~160 MB of a 384 MB heap. Workers died with "FATAL ERROR:
 * Reached heap limit Allocation failed - JavaScript heap out of memory" (19 container restarts in ~1.5 h, heap at
 * 78% on /admin/performance). A share scales with whatever heap the deploy gives a worker.
 */
export function heapShare(fraction: number, capBytes: number, limit = heapLimitBytes()): number {
  if (!limit) return capBytes;
  return Math.max(2 * 1024 * 1024, Math.min(capBytes, Math.floor(limit * fraction)));
}

/**
 * An explicitly in-process, synchronous, bounded TTL + LRU cache. NOT shared across processes, NOT in Redis, and its
 * entries are never broadcast-invalidated — use it only where that is the point (see the module header), and say why
 * at the call site. `name` is documentation / debugging only (it keeps two caches from being confused in a heap
 * snapshot); keys are private to the returned instance.
 */
export function lruL1(name: string, opts: LruL1Options | number = {}): LruL1 {
  // Modest default budget (the shared L1 is the big one); a caller that really holds a lot says so.
  const o = typeof opts === 'number' ? { maxEntries: opts } : opts;
  const cache = new LruL1({
    maxEntries: 1000,
    maxBytes: heapShare(0.01, 8 * 1024 * 1024),
    ...o,
  });
  cache.name = name;
  return cache;
}
