/**
 * The `messages.send-scheduled` cron (s03-12): every minute, deliver the scheduled
 * messages that have come due. Registered once from server/jobs/index.ts; only
 * the worker's boss instance schedules, so the web tier never calls this.
 * Idempotent: a row can only be claimed once (see `runDueScheduledMessages`).
 */

import type { PgBoss } from 'pg-boss';
import { runDueScheduledMessages } from '@/lib/messages/scheduled.server';

export const SEND_SCHEDULED_QUEUE =
  'messages.send-scheduled';
export const SEND_SCHEDULED_CRON =
  '* * * * *';

export async function registerSendScheduledMessagesCron(
  boss: PgBoss,
): Promise<void> {
  await boss.createQueue(
    SEND_SCHEDULED_QUEUE,
  );
  await boss.schedule(
    SEND_SCHEDULED_QUEUE,
    SEND_SCHEDULED_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(
    SEND_SCHEDULED_QUEUE,
    async () => {
      await runDueScheduledMessages();
    },
  );
}
