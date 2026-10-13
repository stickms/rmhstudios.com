import type { PgBoss } from 'pg-boss';
import { sweepStudyBuddy } from './study-buddy.server';

export const STUDY_BUDDY_QUEUE = 'study-buddy.expire';
/** Every two minutes: a "now" request is only worth waiting for ten. */
export const STUDY_BUDDY_CRON = '*/2 * * * *';

/** Registered from `server/jobs/index.ts`, alongside the other crons. */
export async function registerStudyBuddyCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(STUDY_BUDDY_QUEUE);
  await boss.schedule(STUDY_BUDDY_QUEUE, STUDY_BUDDY_CRON, {}, { tz: 'UTC' });
  await boss.work(STUDY_BUDDY_QUEUE, async () => {
    await sweepStudyBuddy();
  });
}
