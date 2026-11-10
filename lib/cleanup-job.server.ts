/**
 * Data-lifecycle cleanup as a pg-boss cron (redesign D4: one scheduler).
 *
 * Was a node-cron job inside `server/ladder-worker`, guarded by a DB worker-lease. The queries are
 * unchanged (`lib/cleanup.server.ts`); only the trigger moved. It now runs in the `jobs` worker:
 * the `exclusive` queue policy holds at most one sweep queued or active, which is what the lease
 * guaranteed, so the cleanup lease is gone.
 *
 * Cadence: `CLEANUP_CRON_SCHEDULE` (default `0 4 * * *`), evaluated in UTC as before.
 * `retryLimit: 0`: `runCleanup` catches every sub-task's error itself, and a retry of a sweep that
 * died mid-way would only run into the next night's tick anyway.
 */
import { prisma } from '@/lib/prisma.server';
import { runCleanup, cleanupOptionsFromEnv } from '@/lib/cleanup.server';

export const CLEANUP_QUEUE = 'ops.data-cleanup';
export const DEFAULT_CLEANUP_CRON = '0 4 * * *';

/** One sweep. Never throws: a failed sweep is logged and the next tick tries again. */
export async function runCleanupTick(): Promise<void> {
  try {
    const result = await runCleanup(
      prisma,
      cleanupOptionsFromEnv((line) => console.warn(`[cleanup] ${line}`)),
    );
    console.warn(
      `[cleanup] complete sessions=${result.expiredSessions} verifications=${result.expiredVerifications} notifications=${result.oldNotifications} notificationsCapped=${result.cappedNotifications} commentViews=${result.oldCommentViews} softDeletedPosts=${result.hardDeletedPosts} durationMs=${result.durationMs}`,
    );
  } catch (error) {
    console.error('[cleanup] run failed:', error);
  }
}

export async function registerCleanupCron(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  // A sweep with a big backlog can outlast pg-boss's 15 min default; the batch ceiling bounds it.
  await boss.createQueue(CLEANUP_QUEUE, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 2 * 60 * 60,
  });
  await boss.schedule(
    CLEANUP_QUEUE,
    process.env.CLEANUP_CRON_SCHEDULE?.trim() || DEFAULT_CLEANUP_CRON,
    {},
    { tz: 'UTC' },
  );
  await boss.work(CLEANUP_QUEUE, async () => {
    await runCleanupTick();
  });
}
