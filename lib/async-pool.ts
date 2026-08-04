/**
 * Bounded-concurrency async mapping.
 *
 * The repo's batch work (flushing buffered counters, reconciling rows) is made
 * of independent per-item awaits. Running them in sequence wastes the whole
 * batch on round-trip latency; running them all through `Promise.all` opens as
 * many concurrent operations as the batch has items, which can exhaust the
 * Postgres pool (`DATABASE_POOL_SIZE`, default 10) and starve request handlers.
 *
 * This is the middle ground: at most `limit` operations in flight, workers
 * pulling from a shared cursor so a slow item never blocks the others.
 *
 * Pure and I/O-free, so it is safe to import from client or server code.
 */

/**
 * Map `items` through `fn` with at most `limit` calls in flight.
 *
 * Results are returned in INPUT order regardless of completion order. A
 * rejection propagates (like `Promise.all`); pass a `fn` that catches when
 * partial failure should be tolerated.
 *
 * `limit` is clamped to at least 1, so a bad value degrades to sequential
 * execution rather than deadlocking on zero workers.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
