/**
 * pg-boss registration for the economy-plus jobs (C5, C7, C8). Server-only.
 *
 * Registered once from `server/jobs/index.ts`, like `registerMaintenanceCrons`
 * and for the same reason: only the worker's boss instance has `schedule: true`.
 * Every handler is idempotent — pg-boss delivers at-least-once, and these move
 * coins.
 */
import type { PgBoss } from 'pg-boss';
import { sweepCommunityGoals } from '@/lib/economy/community-goal.server';
import { deliverDueGifts } from '@/lib/gifting/scheduled-gift.server';
import { runWishlistAlerts } from '@/lib/wishlist/price-alerts.server';

export const COMMUNITY_GOAL_QUEUE = 'economy.community-goals';
export const SCHEDULED_GIFT_QUEUE = 'economy.scheduled-gifts';
export const WISHLIST_ALERT_QUEUE = 'economy.wishlist-alerts';

/** Every five minutes: a deadline is honoured to within one tick; the query is one index scan. */
export const COMMUNITY_GOAL_CRON = '*/5 * * * *';
/** Every minute: a gift is a promise about a date, and the due-scan is an index range. */
export const SCHEDULED_GIFT_CRON = '* * * * *';
/** Daily at 00:05 UTC, just after the daily shop rotates. */
export const WISHLIST_ALERT_CRON = '5 0 * * *';

export async function registerEconomyCrons(boss: PgBoss): Promise<void> {
  await boss.createQueue(COMMUNITY_GOAL_QUEUE);
  await boss.createQueue(SCHEDULED_GIFT_QUEUE);
  await boss.createQueue(WISHLIST_ALERT_QUEUE);

  await boss.schedule(COMMUNITY_GOAL_QUEUE, COMMUNITY_GOAL_CRON, {}, { tz: 'UTC' });
  await boss.schedule(SCHEDULED_GIFT_QUEUE, SCHEDULED_GIFT_CRON, {}, { tz: 'UTC' });
  await boss.schedule(WISHLIST_ALERT_QUEUE, WISHLIST_ALERT_CRON, {}, { tz: 'UTC' });

  await boss.work(COMMUNITY_GOAL_QUEUE, async () => {
    await sweepCommunityGoals();
  });
  await boss.work(SCHEDULED_GIFT_QUEUE, async () => {
    await deliverDueGifts();
  });
  await boss.work(WISHLIST_ALERT_QUEUE, async () => {
    await runWishlistAlerts();
  });
}
