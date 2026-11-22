/**
 * The bulk clean-up queue — server only.
 *
 * `POST /api/bulk` records the operation and calls {@link enqueueBulkRun}; the `bulk.run` work queue (run by the jobs
 * worker, `server/jobs/index.ts`) calls `runBulkOperation`. The payload is only the operation id: kind, filter and
 * cursor are read from the row, so a job queued by one build is run correctly by the next, and a deploy mid-run loses
 * nothing. Whether a job may run is decided by the lease on the row (`claimLease` in `./bulk.server`), never by the
 * job: a duplicate or a late job finds the lease held and returns.
 *
 * `bulk.reclaim` runs every minute: `reclaimStalledOperations` finds the operations whose lease expired (their
 * process died or was restarted) and queues them again, up to five times.
 *
 * When the queue is unavailable the web tier runs the operation detached in its own process, as before: this queue
 * is an optimisation for surviving restarts, never a correctness dependency.
 */
import type { PgBoss } from 'pg-boss';
import { getBoss } from '@/lib/jobs/boss.server';
import { reclaimStalledOperations, runBulkOperation, startBulkOperation } from '@/lib/bulk/bulk.server';

export const BULK_RUN_QUEUE = 'bulk.run';
export const BULK_RECLAIM_QUEUE = 'bulk.reclaim';
/** Every minute. */
export const BULK_RECLAIM_CRON = '* * * * *';

export interface BulkRunJob {
  operationId: string;
}

/** The job options: one waiting job per operation (the `short` queue policy keys on this), retried, and allowed to run for an hour before pg-boss expires it. */
export function bulkRunSendOptions(operationId: string) {
  return {
    singletonKey: `bulk-run:${operationId}`,
    retryLimit: 3,
    retryDelay: 30,
    expireInSeconds: 60 * 60,
  };
}

/**
 * Queue the operation for the jobs worker. Falls back to a detached run in this process when the queue is
 * unavailable or refuses the job. Never rejects.
 */
export async function enqueueBulkRun(operationId: string, bossOverride?: PgBoss | null): Promise<'queued' | 'inline'> {
  try {
    const boss = bossOverride === undefined ? await getBoss() : bossOverride;
    if (!boss) throw new Error('queue unavailable');
    const job: BulkRunJob = { operationId };
    // `send` resolves to null when the queue (policy `short`) already holds a waiting job for this operation: that job runs it.
    await boss.send(BULK_RUN_QUEUE, job, bulkRunSendOptions(operationId));
    return 'queued';
  } catch (error) {
    console.error('[bulk] could not queue the run; running it in this process:', error);
    startBulkOperation(operationId);
    return 'inline';
  }
}

/** The work queue: one job per operation. A throw makes pg-boss retry; the lease makes the retry safe. */
export async function registerBulkWorker(boss: PgBoss): Promise<void> {
  // Policy `short`: one waiting job per operation id, any number running. A job left `active` by a process that died
  // therefore never blocks the reclaim sweep from queueing the operation again.
  await boss.createQueue(BULK_RUN_QUEUE, { policy: 'short' });
  await boss.work<BulkRunJob>(BULK_RUN_QUEUE, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) await runBulkOperation(job.data.operationId);
  });
}

/** Every minute: queue the operations whose lease expired, and stop the ones that keep dying. */
export async function registerBulkReclaimCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(BULK_RECLAIM_QUEUE);
  await boss.schedule(BULK_RECLAIM_QUEUE, BULK_RECLAIM_CRON, {}, { tz: 'UTC' });
  await boss.work(BULK_RECLAIM_QUEUE, async () => {
    const ids = await reclaimStalledOperations();
    for (const id of ids) await enqueueBulkRun(id, boss);
  });
}
