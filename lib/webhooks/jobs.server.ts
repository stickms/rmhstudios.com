/**
 * Webhook retry drain, on the jobs worker's schedule.
 *
 * A first delivery attempt happens inline at emit time (`emitWebhookEvent`); a failed
 * one stays PENDING with a backoff `nextAttemptAt` (1 min, 5 min, 30 min, 2 h, 6 h).
 * Nothing used to drain them: the drain was an HTTP cron route that no scheduler ever
 * called, so a delivery that failed once was never retried and never marked FAILED.
 * The jobs worker is the only scheduler (redesign audit D4), so the drain runs here,
 * once a minute: the shortest backoff step.
 */
import type { PgBoss } from 'pg-boss';
import { deliverDuePending } from '@/lib/webhooks/emit.server';

export const WEBHOOK_RETRY_QUEUE = 'webhooks.retry';
export const WEBHOOK_RETRY_CRON = '* * * * *';
/** Deliveries attempted per tick; a backlog drains over the next minutes, oldest first. */
export const WEBHOOK_RETRY_BATCH = 50;

export async function registerWebhookRetryCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(WEBHOOK_RETRY_QUEUE);
  await boss.schedule(WEBHOOK_RETRY_QUEUE, WEBHOOK_RETRY_CRON, {}, { tz: 'UTC' });
  await boss.work(WEBHOOK_RETRY_QUEUE, async () => {
    await deliverDuePending(WEBHOOK_RETRY_BATCH);
  });
}
