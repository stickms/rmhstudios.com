/**
 * M3 — disappearing messages. Server-only.
 *
 * Two halves, like custom status:
 *  1. **Read time.** `liveMessages()` is the Prisma clause every read path ANDs
 *     in, so an expired message is invisible the instant it expires, whether or
 *     not the sweep has run.
 *  2. **A sweep job** that deletes the rows, registered like the other pg-boss
 *     crons. It is housekeeping — nothing depends on its latency — and is safe
 *     to run twice.
 */

import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';

/** `AND` this into any `directMessage` / `groupMessage` where-clause. */
export function liveMessages(now: Date = new Date()) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export const CHAT_EXPIRY_QUEUE = 'chat.expire-messages';
/** Every 10 minutes: read-time hiding makes the latency irrelevant. */
export const CHAT_EXPIRY_CRON = '*/10 * * * *';
const BATCH = 500;
const MAX_BATCHES = 20;

export interface ExpirySweepResult {
  directDeleted: number;
  groupDeleted: number;
  pinsDeleted: number;
}

/**
 * Delete messages past their `expiresAt`, in bounded batches.
 *
 * A message with an open report is left alone: the report is evidence, and a
 * disappearing-message timer must not become the fastest way to destroy it. It
 * stays hidden from participants (read-time rule) and is collected after the
 * report is resolved.
 */
export async function sweepExpiredMessages(now: Date = new Date()): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { directDeleted: 0, groupDeleted: 0, pinsDeleted: 0 };
  const ids: string[] = [];

  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM "direct_message" WHERE "id" IN (
        SELECT m."id" FROM "direct_message" m
        WHERE m."expiresAt" IS NOT NULL AND m."expiresAt" <= ${now}
          AND NOT EXISTS (
            SELECT 1 FROM "content_report" r
            WHERE r."entityType" = 'dm' AND r."entityId" = m."id" AND r."status" = 'PENDING')
        LIMIT ${BATCH})
      RETURNING "id"`;
    result.directDeleted += rows.length;
    ids.push(...rows.map((r) => r.id));
    if (rows.length < BATCH) break;
  }
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM "group_message" WHERE "id" IN (
        SELECT m."id" FROM "group_message" m
        WHERE m."expiresAt" IS NOT NULL AND m."expiresAt" <= ${now}
        LIMIT ${BATCH})
      RETURNING "id"`;
    result.groupDeleted += rows.length;
    ids.push(...rows.map((r) => r.id));
    if (rows.length < BATCH) break;
  }

  // Pins have no FK to the message (it can live in either table).
  for (let i = 0; i < ids.length; i += 1000) {
    const res = await prisma.chatPin.deleteMany({
      where: { messageId: { in: ids.slice(i, i + 1000) } },
    });
    result.pinsDeleted += res.count;
  }
  return result;
}

/** Register the sweep. Called once from the jobs worker (only it can schedule). */
export async function registerChatExpiryCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(CHAT_EXPIRY_QUEUE);
  await boss.schedule(CHAT_EXPIRY_QUEUE, CHAT_EXPIRY_CRON, {}, { tz: 'UTC' });
  await boss.work(CHAT_EXPIRY_QUEUE, async () => {
    await sweepExpiredMessages();
  });
}
