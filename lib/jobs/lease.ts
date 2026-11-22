/**
 * The one rule the three leased job kinds (bulk clean-ups, fan-outs, spam sweeps) share: what a reclaim pass does
 * with a RUNNING row whose lease ran out. Pure; each table keeps its own SQL and compares-and-sets on what it read.
 *
 * A reclaim counts (`reclaims + 1`) only when a runner actually started since the previous reclaim, that is when
 * `claimedAt` is later than `reclaimedAt`. While the re-queued job waits behind a dead or absent worker the pass
 * only queues it again, with the same singleton job key, and counts nothing: a deploy or a few minutes of worker
 * downtime delays a run, it never fails it. A run nobody picks up for a day is stopped.
 */

/** A run that has waited this long with no runner at all is stopped. */
export const NO_WORKER_AFTER_MS = 24 * 60 * 60 * 1000;

/** The reclaim passes that count before the next dead attempt fails the run. */
export const MAX_COUNTED_RECLAIMS = 5;

/** What a reader of the row sees to the owner of a run stopped after a day with no runner. */
export const NO_WORKER_ERROR = 'No worker picked this up for a day';

export type ReclaimVerdict = 'skip' | 'requeue' | 'count' | 'fail';

export interface ReclaimInput {
  /** When a runner last took the lease; null on rows from before the column existed. */
  claimedAt: Date | null;
  /** When a reclaim pass last counted; null when none has. */
  reclaimedAt: Date | null;
  /** Counted reclaims so far. */
  reclaims: number;
  /** When the run was queued (the row's creation, or the sweep's `queuedAt`). */
  createdAt: Date;
  now: Date;
  /** The lease's last renewal; a row with no `claimedAt` is judged as claimed then (rows from before the migration). */
  heartbeatAt?: Date | null;
  /** With `heartbeatAt`: a lease renewed within this many ms is live and the row is skipped. */
  leaseMs?: number;
  /** Counted reclaims allowed; default {@link MAX_COUNTED_RECLAIMS}. */
  maxReclaims?: number;
}

/** True when a runner started the run since the last counted reclaim. */
export function attemptedSinceReclaim(input: Pick<ReclaimInput, 'claimedAt' | 'reclaimedAt' | 'heartbeatAt'>): boolean {
  const claimed = input.claimedAt ?? input.heartbeatAt ?? null;
  if (!claimed) return false;
  if (!input.reclaimedAt) return true;
  return claimed.getTime() > input.reclaimedAt.getTime();
}

/** The last sign of life of a run (its claim or its lease renewal), or its queueing time when it never had one. */
export function waitingSince(input: Pick<ReclaimInput, 'claimedAt' | 'heartbeatAt' | 'createdAt'>): Date {
  const times = [input.claimedAt, input.heartbeatAt].filter((d): d is Date => !!d);
  if (times.length === 0) return input.createdAt;
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

/** Whether `fail` came from a day with no runner rather than from dead attempts, for the message. */
export function failedForNoWorker(input: ReclaimInput): boolean {
  return !attemptedSinceReclaim(input) && input.now.getTime() - waitingSince(input).getTime() >= NO_WORKER_AFTER_MS;
}

export function reclaimDecision(input: ReclaimInput): ReclaimVerdict {
  const { now, heartbeatAt, leaseMs } = input;
  if (heartbeatAt && leaseMs !== undefined && heartbeatAt.getTime() >= now.getTime() - leaseMs) return 'skip';
  if (attemptedSinceReclaim(input)) {
    return input.reclaims >= (input.maxReclaims ?? MAX_COUNTED_RECLAIMS) ? 'fail' : 'count';
  }
  if (failedForNoWorker(input)) return 'fail';
  return 'requeue';
}

/**
 * True when a RUNNING row has been re-queued (or never started) and no runner has claimed it since: it is waiting for
 * a worker, not running. For the jobs console.
 */
export function waitingForWorker(row: Pick<ReclaimInput, 'claimedAt' | 'reclaimedAt' | 'heartbeatAt'>): boolean {
  return !attemptedSinceReclaim(row);
}
