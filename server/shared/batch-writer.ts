/**
 * Coalesce high-frequency, fire-and-forget DB writes into one statement per
 * interval.
 *
 * For append-only rows that gameplay never waits on (chat transcripts), one
 * INSERT per event costs a pool checkout and a round trip each; at a few
 * hundred messages a second that is the hub's whole share of the shared
 * Postgres. `add()` is synchronous and allocation-light; the batch is written
 * with a single `write(items)` call every `flushMs`, or sooner when `maxBatch`
 * rows are waiting. `flush()` drains on demand (graceful shutdown).
 *
 * Failure semantics match the fire-and-forget writes this replaces: a batch
 * whose `write` rejects is reported to `onError` and dropped by THIS writer (it
 * never re-queues it; a caller's `write` may still retry internally, as the
 * rmhtube chat handler does row by row, which bounds the retry to that batch).
 * Writes are serialised, so if the database stalls the batches queue behind the
 * one in flight; that queue is capped at `maxQueuedBatches` (default 8, i.e.
 * 8 x `maxBatch` rows) and a batch that would exceed it is dropped, reported to
 * `onError` and counted in `dropped`, instead of growing without bound. The
 * durability window is `flushMs` (default 1 s) of a crash.
 */
export interface BatchWriterOptions<T> {
  write: (items: T[]) => Promise<unknown>;
  onError: (err: unknown, dropped: number) => void;
  flushMs?: number;
  maxBatch?: number;
  /** Batches allowed to wait on the serialised write chain. Default 8. */
  maxQueuedBatches?: number;
}

/** Passed to `onError` for a batch dropped because the write chain was full. */
export class BatchQueueFullError extends Error {
  constructor() {
    super('batch writer queue is full; batch dropped');
    this.name = 'BatchQueueFullError';
  }
}

export interface BatchWriter<T> {
  add(item: T): void;
  flush(): Promise<void>;
  /** Items waiting for the next write. */
  readonly pending: number;
  /** Items dropped because the write chain was full (not counting failed writes). */
  readonly dropped: number;
}

export function createBatchWriter<T>(opts: BatchWriterOptions<T>): BatchWriter<T> {
  const flushMs = opts.flushMs ?? 1_000;
  const maxBatch = opts.maxBatch ?? 200;
  let buffer: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const maxQueued = opts.maxQueuedBatches ?? 8;
  let inFlight: Promise<void> = Promise.resolve();
  let queued = 0;
  let dropped = 0;

  const drain = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length === 0) return inFlight;
    const batch = buffer;
    buffer = [];
    if (queued >= maxQueued) {
      dropped += batch.length;
      opts.onError(new BatchQueueFullError(), batch.length);
      return inFlight;
    }
    queued++;
    // Serialise writes so ordering by insertion is preserved and the pool sees
    // at most one batch from this writer at a time.
    inFlight = inFlight.then(async () => {
      try {
        await opts.write(batch);
      } catch (err) {
        opts.onError(err, batch.length);
      } finally {
        queued--;
      }
    });
    return inFlight;
  };

  return {
    add(item: T): void {
      buffer.push(item);
      if (buffer.length >= maxBatch) {
        void drain();
      } else if (!timer) {
        timer = setTimeout(() => void drain(), flushMs);
        // Never keep the process alive just to flush; shutdown calls flush().
        timer.unref?.();
      }
    },
    flush: drain,
    get pending(): number {
      return buffer.length;
    },
    get dropped(): number {
      return dropped;
    },
  };
}
