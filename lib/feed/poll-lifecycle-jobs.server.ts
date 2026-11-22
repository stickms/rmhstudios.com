/**
 * The `feed.poll-ended` cron (s04-08): every minute, tell the author and the voters of each poll that has ended.
 * Registered once from server/jobs/index.ts; only the worker's boss instance schedules, so the web tier never calls
 * this. Idempotent: a poll can only be claimed once (see `runPollEndNotices`).
 */
import type { PgBoss } from 'pg-boss';
import { runPollEndNotices } from '@/lib/feed/poll-lifecycle.server';

export const POLL_ENDED_QUEUE = 'feed.poll-ended';
export const POLL_ENDED_CRON = '* * * * *';

export async function registerPollEndedCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(POLL_ENDED_QUEUE);
  await boss.schedule(
    POLL_ENDED_QUEUE,
    POLL_ENDED_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(POLL_ENDED_QUEUE, async () => {
    await runPollEndNotices();
  });
}
