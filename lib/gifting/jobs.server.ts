/**
 * Gifting & events crons (P11). Registered from `server/jobs/index.ts`; both
 * handlers are idempotent (birthdays claim `lastNotifiedYear`, draws claim the
 * exchange's OPEN status), so pg-boss's at-least-once delivery is safe.
 */
import type { PgBoss } from 'pg-boss';
import { notifyTodaysBirthdays } from '@/lib/gifting/birthday.server';
import { sweepDueExchanges } from '@/lib/gifting/exchange.server';

export const BIRTHDAY_QUEUE = 'gifting.birthdays';
export const EXCHANGE_DRAW_QUEUE = 'gifting.exchange-draws';
/** Daily at 00:05 UTC — "the day" is the UTC day everywhere in this feature. */
export const BIRTHDAY_CRON = '5 0 * * *';
/** Every five minutes: a deadline is honoured to within one tick. */
export const EXCHANGE_DRAW_CRON = '*/5 * * * *';

export async function registerGiftingCrons(boss: PgBoss): Promise<void> {
  await boss.createQueue(BIRTHDAY_QUEUE);
  await boss.createQueue(EXCHANGE_DRAW_QUEUE);
  await boss.schedule(BIRTHDAY_QUEUE, BIRTHDAY_CRON, {}, { tz: 'UTC' });
  await boss.schedule(EXCHANGE_DRAW_QUEUE, EXCHANGE_DRAW_CRON, {}, { tz: 'UTC' });
  await boss.work(BIRTHDAY_QUEUE, async () => {
    await notifyTodaysBirthdays();
  });
  await boss.work(EXCHANGE_DRAW_QUEUE, async () => {
    await sweepDueExchanges();
  });
}
