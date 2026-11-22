/**
 * The nightly speedrun re-verification (sprint 10, feature 16).
 *
 * `reverifyPending` was "the worker pass, on demand until it is wired into `server/jobs`"; this wires it. Daily at
 * 04:23 UTC it walks the pending queue oldest first in batches of 200 until the queue is drained or 2,000 runs have
 * been looked at, then logs the sum. Safe to run twice: the pass writes only a run whose verdict changed, with a
 * compare-and-set on `pending`, and a run is announced to its runner only by the pass that won that write.
 */
import type { PgBoss } from 'pg-boss';
import { reverifyPending, type ReverifyCursor, type ReverifyResult } from '@/lib/speedrun/speedrun.server';

export const SPEEDRUN_REVERIFY_QUEUE = 'speedrun.reverify';
/** Daily at 04:23 UTC. */
export const SPEEDRUN_REVERIFY_CRON = '23 4 * * *';
export const SPEEDRUN_REVERIFY_BATCH = 200;
export const SPEEDRUN_REVERIFY_CAP = 2000;

type Pass = (limit: number, after?: ReverifyCursor) => Promise<ReverifyResult & { last: ReverifyCursor | null }>;

/** One night's work: batches until a short batch (drained) or the cap. Returns the summed result. */
export async function runSpeedrunReverify(pass: Pass = reverifyPending): Promise<ReverifyResult> {
  const total: ReverifyResult = { checked: 0, verified: 0, rejected: 0, stillPending: 0 };
  let after: ReverifyCursor | undefined;
  while (total.checked < SPEEDRUN_REVERIFY_CAP) {
    const batch = Math.min(SPEEDRUN_REVERIFY_BATCH, SPEEDRUN_REVERIFY_CAP - total.checked);
    const result = await pass(batch, after);
    total.checked += result.checked;
    total.verified += result.verified;
    total.rejected += result.rejected;
    total.stillPending += result.stillPending;
    // A short batch means nothing is left after it.
    if (result.checked < batch || !result.last) break;
    after = result.last;
  }
  return total;
}

/** Register the nightly pass. Called once from the jobs worker (only it can schedule). */
export async function registerSpeedrunReverifyCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(SPEEDRUN_REVERIFY_QUEUE);
  await boss.schedule(SPEEDRUN_REVERIFY_QUEUE, SPEEDRUN_REVERIFY_CRON, {}, { tz: 'UTC' });
  await boss.work(SPEEDRUN_REVERIFY_QUEUE, async () => {
    const result = await runSpeedrunReverify();
    // Counts only; the job's output carries the same result for the jobs console.
    console.warn('[speedrun-reverify]', JSON.stringify(result));
    return result;
  });
}
