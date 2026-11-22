/**
 * The spam-sweep queue — server only (copied from `lib/bulk/queue.server.ts`).
 *
 * Confirming (or undoing) a sweep records the state on the row and calls {@link enqueueSweepRun}; the
 * `moderation.sweep` work queue (the jobs worker, `server/jobs/index.ts`) calls `runSweep`. The payload is only
 * the sweep id: phase, window and cursor are read from the row, so a deploy mid-run loses nothing. Whether a
 * job may run is decided by the lease on the row, never by the job: a duplicate or a late job returns.
 *
 * `moderation.sweep-reclaim` runs every minute and queues the sweeps whose lease expired, up to five times.
 * When the queue is unavailable the web tier runs the sweep detached in its own process: the queue is an
 * optimisation for surviving restarts, never a correctness dependency.
 */
import type { PgBoss } from 'pg-boss';
import { getBoss } from '@/lib/jobs/boss.server';
import { reclaimStalledSweeps, runSweep } from '@/lib/admin/sweeps.server';

export const SWEEP_QUEUE = 'moderation.sweep';
export const SWEEP_RECLAIM_QUEUE = 'moderation.sweep-reclaim';
/** Every minute. */
export const SWEEP_RECLAIM_CRON = '* * * * *';

export interface SweepRunJob {
  sweepId: string;
}

/** One waiting job per sweep (the `short` policy keys on this), retried, allowed to run an hour. */
export function sweepSendOptions(sweepId: string) {
  return {
    singletonKey: `sweep-run:${sweepId}`,
    retryLimit: 3,
    retryDelay: 30,
    expireInSeconds: 60 * 60,
  };
}

/** Detach the run from the request that created it, for when the queue is unavailable. Never rejects. */
function startSweepInline(id: string): void {
  void runSweep(id).catch((error) => {
    console.error(`[sweeps] sweep ${id} crashed:`, error);
  });
}

/** Queue the sweep for the jobs worker; falls back to a detached run in this process. Never rejects. */
export async function enqueueSweepRun(sweepId: string, bossOverride?: PgBoss | null): Promise<'queued' | 'inline'> {
  try {
    const boss = bossOverride === undefined ? await getBoss() : bossOverride;
    if (!boss) throw new Error('queue unavailable');
    const job: SweepRunJob = { sweepId };
    await boss.send(SWEEP_QUEUE, job, sweepSendOptions(sweepId));
    return 'queued';
  } catch (error) {
    console.error('[sweeps] could not queue the run; running it in this process:', error);
    startSweepInline(sweepId);
    return 'inline';
  }
}

/** The work queue: one job per sweep. A throw makes pg-boss retry; the lease makes the retry safe. */
export async function registerSweepWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(SWEEP_QUEUE, { policy: 'short' });
  await boss.work<SweepRunJob>(SWEEP_QUEUE, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) await runSweep(job.data.sweepId);
  });
}

/** Every minute: queue the sweeps whose lease expired, and stop the ones that keep dying. */
export async function registerSweepReclaimCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(SWEEP_RECLAIM_QUEUE);
  await boss.schedule(SWEEP_RECLAIM_QUEUE, SWEEP_RECLAIM_CRON, {}, { tz: 'UTC' });
  await boss.work(SWEEP_RECLAIM_QUEUE, async () => {
    const ids = await reclaimStalledSweeps();
    for (const id of ids) await enqueueSweepRun(id, boss);
  });
}
