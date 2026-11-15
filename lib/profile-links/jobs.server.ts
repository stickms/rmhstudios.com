/**
 * Profile-link re-verification, on the jobs worker's schedule (J1 §5).
 *
 * `reverifyStaleProfileLinks` was written to be driven by a worker tick, and its
 * only driver was an internal HTTP route that no scheduler ever called, so a
 * verified link was never re-checked and kept its mark after the page stopped
 * linking back. The jobs worker is the only scheduler (redesign audit D4).
 *
 * One small batch an hour (at most 600 outbound checks a day, only links that are
 * currently verified and stale), so the sweep can never act like a crawler.
 */
import type { PgBoss } from 'pg-boss';
import { reverifyStaleProfileLinks } from '@/lib/profile-links/verify.server';

export const PROFILE_LINK_REVERIFY_QUEUE = 'profile-links.reverify';
/** Hourly, at minute 23: clear of minute 0, where the step sweeps (every N minutes) fire. */
export const PROFILE_LINK_REVERIFY_CRON = '23 * * * *';
export const PROFILE_LINK_REVERIFY_BATCH = 25;

export async function registerProfileLinkReverifyCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(PROFILE_LINK_REVERIFY_QUEUE);
  await boss.schedule(PROFILE_LINK_REVERIFY_QUEUE, PROFILE_LINK_REVERIFY_CRON, {}, { tz: 'UTC' });
  await boss.work(PROFILE_LINK_REVERIFY_QUEUE, async () => {
    await reverifyStaleProfileLinks({ batchSize: PROFILE_LINK_REVERIFY_BATCH });
  });
}
