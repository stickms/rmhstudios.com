/**
 * The `rmhtube.party-reminders` cron (s03-09): every five minutes, send the 15-minute and the at-start
 * reminders to the members going to a scheduled watch party and close parties nobody opened. Registered
 * from server/jobs/index.ts; the web tier never schedules. Idempotent: see `runPartyReminders`.
 */
import type { PgBoss } from 'pg-boss';
import { runPartyReminders } from '@/lib/rmhtube/parties.server';

export const PARTY_REMINDERS_QUEUE = 'rmhtube.party-reminders';
export const PARTY_REMINDERS_CRON = '*/5 * * * *';

export async function registerPartyRemindersCron(boss: PgBoss): Promise<void> {
  // exclusive: at most one sweep queued or active at a time, however many workers run. The per-member
  // conditional claim in runPartyReminders is what makes a repeated sweep harmless.
  await boss.createQueue(PARTY_REMINDERS_QUEUE, {
    policy: 'exclusive',
  });
  await boss.schedule(
    PARTY_REMINDERS_QUEUE,
    PARTY_REMINDERS_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(PARTY_REMINDERS_QUEUE, async () => {
    await runPartyReminders();
  });
}
