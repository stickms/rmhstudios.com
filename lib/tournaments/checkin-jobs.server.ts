/**
 * The `tournaments.checkin-open` cron (s04-03): every minute, tell the entrants
 * of each tournament whose check-in window has just opened. Registered once from
 * server/jobs/index.ts; only the worker's boss instance schedules. Idempotent:
 * a tournament is claimed once (see `runCheckInNotices`).
 */
import type { PgBoss } from 'pg-boss';
import { runCheckInNotices } from '@/lib/tournaments/checkin.server';

export const CHECKIN_OPEN_QUEUE = 'tournaments.checkin-open';
export const CHECKIN_OPEN_CRON = '* * * * *';

export async function registerCheckInOpenCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(CHECKIN_OPEN_QUEUE);
  await boss.schedule(CHECKIN_OPEN_QUEUE, CHECKIN_OPEN_CRON, {}, { tz: 'UTC' });
  await boss.work(CHECKIN_OPEN_QUEUE, async () => {
    await runCheckInNotices();
  });
}
