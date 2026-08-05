/**
 * A microtask-batched key loader.
 *
 * ## The problem
 *
 * The N+1 read is the easiest performance bug in this codebase to write and the
 * hardest to see: the call site is `await resolveThing(row.id)` inside a
 * `.map()` or a `for` loop, which reads like one line and executes like one
 * round trip per row. Nothing about it looks different from the batched
 * version. `lib/rmhladder/resume/service.server.ts` had one that issued up to
 * 250 sequential `findFirst`s on a user-triggered path.
 *
 * ## The mechanism
 *
 * `createBatcher` returns a `load(key)` function. Every `load` called in the
 * **same synchronous turn** is collected; at the end of that turn (one
 * `Promise.resolve().then()`, i.e. a microtask — sooner than `setTimeout`,
 * sooner than any I/O) the collected keys are handed to `fetchMany` as one
 * array, and each caller's promise resolves from the returned map.
 *
 * This is the whole reason `Promise.all(rows.map((r) => load(r.id)))` collapses
 * to one query: an `async` function body runs synchronously up to its first
 * `await`, so all N `load` calls land before the microtask fires. The corollary
 * matters just as much — a **sequential** `for (const r of rows) await
 * load(r.id)` does *not* batch, because each `await` yields and flushes a batch
 * of one. Restructuring the loop into a concurrent map is the actual fix; this
 * module is what makes that restructuring safe.
 *
 * ## Deliberately not a cache
 *
 * There is no shared instance and no TTL. A batcher is created per request or
 * per operation and thrown away, so it can only ever coalesce reads that are
 * already happening together. A process-lifetime memo of `User` rows would be a
 * correctness bug (a user renames themselves and one worker keeps the old
 * name); `lib/cache.ts` is the place that decision belongs, with an explicit
 * TTL and an invalidation path.
 *
 * No `dataloader` dependency: this is ~40 lines and the parts of that library
 * we would use are exactly these.
 */

/** Resolve a batch of keys to their values. Missing keys are simply absent. */
export type BatchFetcher<K, V> = (keys: K[]) => Promise<Map<K, V>>;

export interface BatcherOptions {
  /**
   * Largest key count handed to `fetchMany` in one call; anything larger is
   * split into sequential chunks.
   *
   * Postgres will happily accept a 10,000-element `IN (…)`, then plan it badly
   * and blow past the statement's memory budget. Prisma's `in` compiles to
   * exactly that list, so an unbounded batch turns "one query" into "one very
   * slow query" — which is a worse failure than the N+1, because it fails under
   * load rather than in review.
   */
  maxBatchSize?: number;
}

const DEFAULT_MAX_BATCH_SIZE = 500;

/**
 * Create a loader that coalesces every key requested in the same microtask into
 * a single `fetchMany` call.
 *
 * ```ts
 * const loadProfile = createBatcher<string, JobProfileRow>(async (jobIds) => {
 *   const rows = await prisma.ladderJobProfile.findMany({ where: { jobId: { in: jobIds } } });
 *   return new Map(rows.map((r) => [r.jobId, r]));
 * });
 *
 * // ONE query for the whole page:
 * const profiles = await Promise.all(jobs.map((j) => loadProfile(j.id)));
 * ```
 */
export function createBatcher<K, V>(
  fetchMany: BatchFetcher<K, V>,
  options: BatcherOptions = {},
): (key: K) => Promise<V | undefined> {
  const maxBatchSize = Math.max(1, options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE);

  let pending: K[] = [];
  let flush: Promise<Map<K, V>> | null = null;

  async function run(keys: K[]): Promise<Map<K, V>> {
    if (keys.length <= maxBatchSize) return fetchMany(keys);
    const merged = new Map<K, V>();
    for (let i = 0; i < keys.length; i += maxBatchSize) {
      const chunk = await fetchMany(keys.slice(i, i + maxBatchSize));
      for (const [key, value] of chunk) merged.set(key, value);
    }
    return merged;
  }

  return function load(key: K): Promise<V | undefined> {
    pending.push(key);
    flush ??= Promise.resolve().then(() => {
      // Reset before awaiting so that (a) keys requested after the flush starts
      // open a fresh batch rather than joining one already in flight, and (b) a
      // rejected fetch cannot poison the next batch.
      const keys = [...new Set(pending)];
      pending = [];
      flush = null;
      return run(keys);
    });
    return flush.then((rows) => rows.get(key));
  };
}

/**
 * `createBatcher` for the shape almost every Prisma call has: a `findMany` that
 * returns rows, plus the field that identifies each one.
 *
 * Saves the `new Map(rows.map(…))` line at every call site, which is the line
 * where the wrong key field gets used and every lookup silently misses.
 */
export function createRowBatcher<K, V>(
  fetchRows: (keys: K[]) => Promise<V[]>,
  keyOf: (row: V) => K,
  options: BatcherOptions = {},
): (key: K) => Promise<V | undefined> {
  return createBatcher<K, V>(async (keys) => {
    const rows = await fetchRows(keys);
    return new Map(rows.map((row) => [keyOf(row), row]));
  }, options);
}
