/**
 * The two pg-boss crons behind reading subscriptions: the 15-minute notification fan-out and the daily email.
 * Registered once from the jobs worker (`server/jobs/index.ts`).
 */
import {
  fanOutNewItems,
  sendDailySubscriptionEmails,
} from '@/lib/reading/subscriptions.server';

export const READING_FANOUT_QUEUE =
  'reading.subscriptions-fanout';
export const READING_EMAIL_QUEUE =
  'reading.subscriptions-email';

/** Every 15 minutes, UTC. */
const FANOUT_CRON =
  '*/15 * * * *';
/** Daily at 17:00 UTC. */
const EMAIL_CRON =
  '0 17 * * *';

export async function registerReadingSubscriptionJobs(boss: {
  createQueue: (
    name: string,
    options?: object,
  ) => Promise<unknown>;
  schedule: (
    name: string,
    cron: string,
    data: object,
    options: object,
  ) => Promise<unknown>;
  work: (
    name: string,
    handler: () => Promise<void>,
  ) => Promise<unknown>;
}): Promise<void> {
  // exclusive: at most one run queued or active however many workers there are (the fan-out also takes a
  // database lock, so even a second worker that slipped past this cannot write twice).
  await boss.createQueue(
    READING_FANOUT_QUEUE,
    {
      policy:
        'exclusive',
    },
  );
  await boss.createQueue(
    READING_EMAIL_QUEUE,
    {
      policy:
        'exclusive',
    },
  );
  await boss.schedule(
    READING_FANOUT_QUEUE,
    FANOUT_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.schedule(
    READING_EMAIL_QUEUE,
    EMAIL_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(
    READING_FANOUT_QUEUE,
    async () => {
      await fanOutNewItems();
    },
  );
  await boss.work(
    READING_EMAIL_QUEUE,
    async () => {
      await sendDailySubscriptionEmails();
    },
  );
}
