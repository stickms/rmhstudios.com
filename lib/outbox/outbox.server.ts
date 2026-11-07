/**
 * Transactional outbox (E4). Server-only.
 *
 * `lib/webhooks/` and `lib/notifications.server.ts` both delivered inside the
 * request that caused the event. Two consequences, neither of which surfaces as
 * an error anyone sees:
 *
 *  1. A crash between the database commit and the send loses the event with no
 *     trace. There is no row saying it was meant to happen, so nothing can
 *     retry it and nothing can even report that it didn't.
 *  2. A slow upstream makes the *user's* request slow. A webhook endpoint
 *     taking four seconds to accept a POST is four seconds the person who
 *     wrote the post spends watching a spinner.
 *
 * Writing the intent in the same transaction as the state change fixes both:
 * the event is durable the moment the thing it describes is durable, and
 * delivery happens on a worker.
 *
 * The cost is that delivery becomes **at-least-once**, which is why
 * `lib/api/idempotency.server.ts` is a prerequisite rather than a nicety —
 * a duplicate delivery must be a no-op at the receiver.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

/** A transaction client, so `enqueue` can join the caller's transaction. */
type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Retry schedule in milliseconds, indexed by attempt count.
 *
 * Front-loaded because most delivery failures are transient (a redeploy, a
 * momentary network fault) and clear in seconds; the long tail exists for an
 * endpoint that is genuinely down for hours. After the last entry the event is
 * marked dead rather than retried forever — an event retried indefinitely
 * against a permanently-dead endpoint is a slow-motion self-DoS.
 */
const BACKOFF_MS = [
  1_000, // ~immediate
  5_000,
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

export const MAX_ATTEMPTS = BACKOFF_MS.length;

/**
 * How long a drain owns an event it claimed. Longer than any handler should
 * take (they POST with ~10s timeouts); a crashed drain's rows come back after it.
 */
export const OUTBOX_LEASE_MS = 5 * 60_000;

export function nextAttemptAt(attempts: number, from = new Date()): Date {
  const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
  return new Date(from.getTime() + delay);
}

/**
 * Record an intent to deliver.
 *
 * Pass the transaction client when there is one — that is the whole point:
 *
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   const post = await tx.rMHark.create({ data });
 *   await enqueueOutbox(tx, 'webhook.post.created', { postId: post.id });
 * });
 * ```
 *
 * Called without a transaction it still works, but the atomicity guarantee is
 * gone and you have merely moved the delivery off the request path.
 */
export async function enqueueOutbox(
  tx: Tx,
  topic: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await tx.outboxEvent.create({ data: { topic, payload } });
}

export interface OutboxHandlerContext {
  id: bigint;
  topic: string;
  payload: unknown;
  attempts: number;
}

export type OutboxHandler = (ctx: OutboxHandlerContext) => Promise<void>;

const handlers = new Map<string, OutboxHandler>();

/**
 * Register a delivery handler for a topic.
 *
 * An unregistered topic is NOT dropped — it stays pending on the normal
 * backoff schedule so that deploying the producer before the consumer (which is
 * the normal ordering during a rollout) doesn't lose events; each pass counts
 * as an attempt, so a topic with no consumer at all ends up dead (kept for
 * inspection) instead of retrying forever.
 */
export function registerOutboxHandler(topic: string, handler: OutboxHandler): void {
  handlers.set(topic, handler);
}

export function registeredTopics(): string[] {
  return [...handlers.keys()];
}

export interface DrainResult {
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  skipped: number;
}

/**
 * Deliver one batch of due events.
 *
 * Ordered by `nextAttempt` so a retry never starves a fresh event of the same
 * age, and bounded by `batchSize` so one drain cannot monopolise the worker.
 * Each event is handled independently — one failing endpoint must not stop the
 * others in the batch, which is the failure mode a naive `for … await` loop
 * with an uncaught throw produces.
 */
export async function drainOutbox(batchSize = 50): Promise<DrainResult> {
  const due = await prisma.outboxEvent.findMany({
    where: { deliveredAt: null, deadAt: null, nextAttempt: { lte: new Date() } },
    orderBy: { nextAttempt: 'asc' },
    take: batchSize,
  });

  const result: DrainResult = {
    claimed: due.length,
    delivered: 0,
    failed: 0,
    dead: 0,
    skipped: 0,
  };

  for (const event of due) {
    // Lease the row before touching it: a CAS that moves `nextAttempt` past
    // the lease. Overlapping drains (a slow pass still running when the next
    // cron tick starts, or two workers) read the same due rows; only the drain
    // whose claim lands delivers, the rest see count 0 and skip. If this
    // process dies mid-delivery, the lease lapses and the row is retried.
    const claim = await prisma.outboxEvent
      .updateMany({
        where: { id: event.id, deliveredAt: null, deadAt: null, nextAttempt: event.nextAttempt },
        data: { nextAttempt: new Date(Date.now() + OUTBOX_LEASE_MS) },
      })
      .catch(() => ({ count: 0 }));
    if (claim.count === 0) {
      result.skipped++;
      continue;
    }

    const handler = handlers.get(event.topic);
    if (!handler) {
      result.skipped++;
      // Count it as a failed attempt and back off. Deploying a producer ahead
      // of its consumer stays safe (the schedule spans ~7h before the row is
      // marked dead, and dead rows are kept), but a topic nobody ever handles
      // no longer retries forever.
      const attempts = event.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await prisma.outboxEvent
        .updateMany({
          where: { id: event.id, deliveredAt: null, attempts: event.attempts },
          data: {
            attempts,
            deadAt: exhausted ? new Date() : null,
            nextAttempt: nextAttemptAt(attempts),
            lastError: `no handler registered for topic ${event.topic}`.slice(0, 500),
          },
        })
        .catch(() => undefined);
      if (exhausted) result.dead++;
      continue;
    }

    try {
      await handler({
        id: event.id,
        topic: event.topic,
        payload: event.payload,
        attempts: event.attempts,
      });
      await prisma.outboxEvent.updateMany({
        where: { id: event.id, deliveredAt: null },
        data: { deliveredAt: new Date(), lastError: null },
      });
      result.delivered++;
    } catch (err) {
      const attempts = event.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await prisma.outboxEvent
        .updateMany({
          // Conditional on the attempt we leased, so a late failure write can
          // never un-deliver a row or clobber a later attempt's bookkeeping.
          where: { id: event.id, deliveredAt: null, attempts: event.attempts },
          data: {
            attempts,
            // Dead rows are kept, not deleted: "what did we fail to deliver
            // last week" is a question you only get to ask if the rows survive.
            deadAt: exhausted ? new Date() : null,
            nextAttempt: nextAttemptAt(attempts),
            lastError: String((err as Error)?.message ?? err).slice(0, 500),
          },
        })
        .catch(() => undefined);
      if (exhausted) result.dead++;
      else result.failed++;
    }
  }

  return result;
}

/** Delivered events older than this are swept; dead ones are kept for inspection. */
export const OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function sweepOutbox(): Promise<number> {
  const { count } = await prisma.outboxEvent.deleteMany({
    where: {
      deliveredAt: { not: null, lt: new Date(Date.now() - OUTBOX_RETENTION_MS) },
    },
  });
  return count;
}
