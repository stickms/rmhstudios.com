/**
 * Nightly sweep of the visitor-counter dedupe ledger (P9). Server-only.
 *
 * The counter total lives in `profile_plus.visitCount`; the per-day rows in
 * `profile_visit_day` exist only to stop the same visitor being counted twice in
 * a day, so anything older than two days is dead weight. Idempotent — a
 * duplicate delivery just deletes nothing.
 */
import { sweepProfileVisits } from '@/lib/profile/plus.server';

export const PROFILE_VISIT_SWEEP_QUEUE = 'profile.visit-sweep';
/** Daily at 04:40 UTC, in the quiet window. */
export const PROFILE_VISIT_SWEEP_CRON = '40 4 * * *';

export async function registerProfileVisitSweepCron(boss: {
  createQueue: (name: string) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(PROFILE_VISIT_SWEEP_QUEUE);
  await boss.schedule(PROFILE_VISIT_SWEEP_QUEUE, PROFILE_VISIT_SWEEP_CRON, {}, { tz: 'UTC' });
  await boss.work(PROFILE_VISIT_SWEEP_QUEUE, async () => {
    const removed = await sweepProfileVisits();
    if (removed > 0) console.warn('[profile] visit sweep', { removed });
  });
}
