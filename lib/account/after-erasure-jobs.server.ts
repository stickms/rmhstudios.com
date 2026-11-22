/**
 * The work that follows the account-deletion transaction, as one idempotent job (sprint 09 16, server only).
 *
 * `anonymizeAccount` runs these steps inline once, so caches drop and names leave match records at once. A step that
 * throws no longer ends as a log line: the failure queues `account.after-erasure` (pg-boss, retried with backoff,
 * one waiting job per member), and the jobs worker (`server/jobs/index.ts`, anchor `s09-16`) runs every step again.
 * Each step is idempotent, so re-running one that already succeeded changes nothing. The payload is only the
 * member's id, and a failure is logged with the step name, never with member data.
 */
import type { PgBoss } from 'pg-boss';
import { dropLearnerBoardCaches } from '@/lib/rmhmusic/learn/social/board-cache.server';
import {
  dropGameBoardCaches,
  scrubAltairMatchResults,
  scrubMatchGameLogs,
  scrubMatchSnapshots,
  scrubTypeMatchResults,
} from '@/lib/account/erasure-games.server';
import { getBoss } from '@/lib/jobs/boss.server';

export const AFTER_ERASURE_QUEUE = 'account.after-erasure';

export interface AfterErasureJob {
  userId: string;
}

export interface AfterErasureStep {
  name: string;
  run: (userId: string) => Promise<void>;
}

/** In the order they ran before this job existed, then the sprint 09 scrubs. */
export const AFTER_ERASURE_STEPS: readonly AfterErasureStep[] = [
  { name: 'learner-board-caches', run: (userId) => dropLearnerBoardCaches(userId, Date.now()) },
  { name: 'game-board-caches', run: (userId) => dropGameBoardCaches(userId) },
  { name: 'match-snapshots', run: scrubMatchSnapshots },
  { name: 'match-game-logs', run: scrubMatchGameLogs },
  { name: 'type-match-results', run: scrubTypeMatchResults },
  { name: 'altair-match-results', run: scrubAltairMatchResults },
];

/** Run every step; one that throws does not stop the rest. Returns the names of the steps that failed. */
export async function runAfterErasureSteps(
  userId: string,
  steps: readonly AfterErasureStep[] = AFTER_ERASURE_STEPS,
): Promise<string[]> {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run(userId);
    } catch {
      failed.push(step.name);
    }
  }
  return failed;
}

/** One waiting job per member (the `short` policy keys on this), retried with backoff. */
export function afterErasureSendOptions(userId: string) {
  return {
    singletonKey: `after-erasure:${userId}`,
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 60 * 60,
  };
}

/** Queue the job. Never rejects: a queue that is down is logged (step names only), and the sweep is not lost silently. */
export async function enqueueAfterErasure(
  userId: string,
  failedSteps: string[],
  bossOverride?: PgBoss | null,
): Promise<boolean> {
  try {
    const boss = bossOverride === undefined ? await getBoss() : bossOverride;
    if (!boss) throw new Error('queue unavailable');
    const job: AfterErasureJob = { userId };
    await boss.send(AFTER_ERASURE_QUEUE, job, afterErasureSendOptions(userId));
    return true;
  } catch {
    console.error(`[account] after-erasure steps failed and could not be queued: ${failedSteps.join(', ')}`);
    return false;
  }
}

/**
 * The inline pass `anonymizeAccount` makes: every step once; if any threw, queue the job. Never rejects, so a
 * failing step cannot undo or fail the committed erasure.
 */
export async function runAfterErasureInline(userId: string): Promise<void> {
  const failed = await runAfterErasureSteps(userId);
  if (failed.length > 0) await enqueueAfterErasure(userId, failed);
}

/** What the worker does with one job: all the steps, and a throw (so pg-boss retries) naming the failed steps. */
export async function handleAfterErasureJob(
  job: { data: AfterErasureJob; retryCount?: number; retryLimit?: number },
  steps: readonly AfterErasureStep[] = AFTER_ERASURE_STEPS,
): Promise<void> {
  const failed = await runAfterErasureSteps(job.data.userId, steps);
  if (failed.length === 0) return;
  const last = (job.retryCount ?? 0) >= (job.retryLimit ?? afterErasureSendOptions('').retryLimit);
  if (last) console.error(`[account] after-erasure gave up after its retries; failed steps: ${failed.join(', ')}`);
  throw new Error(`after-erasure steps failed: ${failed.join(', ')}`);
}

/** The work queue: one job per deleted member. */
export async function registerAfterErasureWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(AFTER_ERASURE_QUEUE, { policy: 'short' });
  await boss.work<AfterErasureJob>(
    AFTER_ERASURE_QUEUE,
    { localConcurrency: 2, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) await handleAfterErasureJob(job);
    },
  );
}
