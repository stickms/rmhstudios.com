/**
 * Resumable backfill framework (E9). Server-only.
 *
 * Data migrations are ad-hoc scripts today — `backfill-handles.ts`,
 * `reconcile-feed-counts.ts`, `migrate-albums-to-storage.ts` and friends. Each
 * re-implements batching, and none of them is resumable. That second part is
 * the expensive one: an interruption at 80% means starting over, so large
 * backfills get deferred, and deferred backfills are how a schema stays
 * half-migrated for months.
 *
 * Three properties this gives every backfill for free:
 *
 *  - **Checkpointing.** Progress survives a crash, a deploy, or a deliberate
 *    stop. Re-running resumes from the last committed cursor.
 *  - **Deliberate slowness.** A pause between batches leaves headroom for live
 *    traffic. A backfill that saturates the connection pool is an outage with a
 *    good intention.
 *  - **Observability.** `BackfillCheckpoint` rows are queryable, so a backfill
 *    you can watch is one people are actually willing to start.
 */

import { prisma } from '@/lib/prisma.server';

export interface BackfillSpec<T> {
  /** Stable identity — the checkpoint key. Changing it restarts from scratch. */
  name: string;
  /** Rows per batch. Keep it small enough that one batch is a short transaction. */
  batchSize?: number;
  /**
   * Milliseconds to idle between batches. Deliberately non-zero: the goal is to
   * finish eventually without competing with request traffic for the pool.
   */
  pauseMs?: number;
  /**
   * Fetch the next batch strictly after `afterCursor`, ordered by that cursor.
   * Must return an empty array when done.
   */
  fetch: (afterCursor: string | null, take: number) => Promise<T[]>;
  /** The cursor value for a row — usually its id. Must be monotonically ordered. */
  cursorOf: (row: T) => string;
  /** Do the work. Throwing aborts the run WITHOUT advancing the checkpoint. */
  apply: (batch: T[]) => Promise<void>;
}

export interface BackfillProgress {
  name: string;
  processed: number;
  cursor: string | null;
  done: boolean;
  startedAt: Date;
  updatedAt: Date;
}

async function loadCheckpoint(name: string) {
  return prisma.backfillCheckpoint.upsert({
    where: { name },
    create: { name },
    update: {},
  });
}

/**
 * Run (or resume) a backfill to completion.
 *
 * The checkpoint is written *after* `apply` succeeds, never before — so a crash
 * mid-batch replays that batch rather than skipping it. That makes `apply`
 * required to be **idempotent**, which is the one thing a caller must get
 * right; every backfill worth writing already is, because it is setting a
 * derived value rather than incrementing one.
 */
export async function runBackfill<T>(spec: BackfillSpec<T>): Promise<BackfillProgress> {
  const batchSize = spec.batchSize ?? 500;
  const pauseMs = spec.pauseMs ?? 50;

  const checkpoint = await loadCheckpoint(spec.name);
  if (checkpoint.doneAt) {
    return {
      name: spec.name,
      processed: checkpoint.processed,
      cursor: checkpoint.cursor,
      done: true,
      startedAt: checkpoint.startedAt,
      updatedAt: checkpoint.updatedAt,
    };
  }

  let cursor = checkpoint.cursor;
  let processed = checkpoint.processed;

  for (;;) {
    const batch = await spec.fetch(cursor, batchSize);
    if (batch.length === 0) break;

    await spec.apply(batch);

    cursor = spec.cursorOf(batch[batch.length - 1]!);
    processed += batch.length;

    await prisma.backfillCheckpoint.update({
      where: { name: spec.name },
      data: { cursor, processed },
    });

    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }

  const finished = await prisma.backfillCheckpoint.update({
    where: { name: spec.name },
    data: { doneAt: new Date(), cursor, processed },
  });

  return {
    name: spec.name,
    processed: finished.processed,
    cursor: finished.cursor,
    done: true,
    startedAt: finished.startedAt,
    updatedAt: finished.updatedAt,
  };
}

/** Current state of every backfill, for the admin dashboard. */
export async function backfillStatus(): Promise<BackfillProgress[]> {
  const rows = await prisma.backfillCheckpoint.findMany({ orderBy: { startedAt: 'desc' } });
  return rows.map((r) => ({
    name: r.name,
    processed: r.processed,
    cursor: r.cursor,
    done: r.doneAt !== null,
    startedAt: r.startedAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Forget a checkpoint so the next run starts from the beginning.
 *
 * Separate from `runBackfill` on purpose — re-running a completed backfill
 * should take a deliberate act, not a flag someone passes by accident.
 */
export async function resetBackfill(name: string): Promise<void> {
  await prisma.backfillCheckpoint
    .delete({ where: { name } })
    .catch(() => undefined);
}
