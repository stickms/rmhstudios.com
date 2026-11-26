/**
 * Reports of a message in an RMHTube room (s13-06).
 *
 * `RmhTubeChatMessage` has a plain `userId` and no `User` relation, so the erasure coverage test never asks about it;
 * the operation here and `lib/account/__tests__/tube-chat-erasure.test.ts` are the record of what happens to it.
 *
 * - `chatReportAuthor`: who a report of the message is about, only for a member of the message's room (present or
 *   past) who did not write it. Everyone else gets the same `null` as an unknown id, so message ids cannot be probed.
 * - `chatPreviews`: the one message a moderator reads (text, room, time), never the conversation around it.
 * - `takeDownChatMessage`: delete the row, then tell the running hub through Redis so the room drops it too.
 * - `chatMessageErasureOps`: the erased member's rows are de-identified, the text stays.
 * - `pruneRoomChat`: the nightly retention sweep.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { redisPublish } from '@/lib/redis.server';
import { CHAT_REMOVED_CHANNEL, DELETED_MEMBER_NAME } from '@/lib/rmhtube/events';

export { CHAT_REMOVED_CHANNEL };
/** What an erased member's name becomes in every room's history. */
export const DELETED_CHAT_NAME = DELETED_MEMBER_NAME;
/** A message older than this is pruned, unless it is among its room's newest `KEEP_NEWEST_PER_ROOM`. */
export const CHAT_RETENTION_DAYS = 90;
export const KEEP_NEWEST_PER_ROOM = 200;
export const CHAT_PRUNE_BATCH = 1000;
/** Upper bound on batches in one run, so a bug cannot loop forever. */
const MAX_BATCHES = 1000;

export const CHAT_PRUNE_QUEUE = 'rmhtube.chat-prune';
/** Daily at 04:17 UTC. */
export const CHAT_PRUNE_CRON = '17 4 * * *';

const DAY_MS = 86_400_000;

/** The member who wrote a message, with no membership check (the report route's best-effort target lookup). */
export async function chatMessageAuthor(messageId: string): Promise<string | null> {
  const row = await prisma.rmhTubeChatMessage.findUnique({ where: { id: messageId }, select: { userId: true } });
  return row?.userId ?? null;
}

/**
 * The author of a message the reporter may report, else `null` (unknown or pruned message, a room the reporter never
 * joined, or the reporter's own message).
 */
export async function chatReportAuthor(messageId: string, reporterId: string): Promise<string | null> {
  const message = await prisma.rmhTubeChatMessage.findUnique({
    where: { id: messageId },
    select: { userId: true, roomId: true },
  });
  if (!message || message.userId === reporterId) return null;
  const member = await prisma.rmhTubeRoomMember.findUnique({
    where: { roomId_userId: { roomId: message.roomId, userId: reporterId } },
    select: { id: true },
  });
  return member ? message.userId : null;
}

/** The moderator's view of each reported message, keyed by message id: its room, its time and its text. */
export async function chatPreviews(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await prisma.rmhTubeChatMessage.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, content: true, createdAt: true, roomId: true, room: { select: { name: true } } },
  });
  for (const row of rows) {
    const at = row.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    out.set(row.id, `Room ${row.room.name?.trim() || row.roomId} · ${at} UTC: ${row.content}`);
  }
  return out;
}

export interface ChatTakedown {
  /** The row existed and is now gone. */
  deleted: boolean;
  /** The hub was told through Redis; false without Redis, when the running room is not reached. */
  published: boolean;
}

/** Delete the message, then tell the hub. Idempotent: a message already gone publishes nothing. */
export async function takeDownChatMessage(messageId: string): Promise<ChatTakedown> {
  const row = await prisma.rmhTubeChatMessage.findUnique({ where: { id: messageId }, select: { roomId: true } });
  if (!row) return { deleted: false, published: false };
  await prisma.rmhTubeChatMessage.deleteMany({ where: { id: messageId } });
  const published = redisPublish(CHAT_REMOVED_CHANNEL, { roomId: row.roomId, messageId });
  return { deleted: true, published };
}

/**
 * The erased member's messages, in every room: the name goes, the text stays (as their posts' does). Rooms running
 * at that moment are told by the hub's `rmhtube:member:erased` message, published after the erasure commits (s15-18);
 * without Redis they keep the old name until the hub restarts.
 */
export function chatMessageErasureOps(userId: string) {
  return [
    prisma.rmhTubeChatMessage.updateMany({
      where: { userId, NOT: { userName: DELETED_CHAT_NAME } },
      data: { userName: DELETED_CHAT_NAME },
    }),
  ];
}

/**
 * One batch: messages older than the retention window that are not among their room's newest 200 and that no open
 * report names. Raw SQL on the real table; a deleted message a reply points at sets the reply's `replyToId` null
 * (the foreign key's `ON DELETE SET NULL`). Returns the number deleted.
 */
async function pruneBatch(cutoff: Date, batch: number): Promise<number> {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "rmhtube_chat_message"
     WHERE "id" IN (
       SELECT ranked."id"
         FROM (
           SELECT m."id", m."createdAt",
                  ROW_NUMBER() OVER (PARTITION BY m."roomId" ORDER BY m."createdAt" DESC, m."id" DESC) AS "rank"
             FROM "rmhtube_chat_message" m
         ) ranked
        WHERE ranked."rank" > ${KEEP_NEWEST_PER_ROOM}
          AND ranked."createdAt" < ${cutoff}
          AND NOT EXISTS (
            SELECT 1
              FROM "content_report" r
             WHERE r."entityType" = 'tube-chat'
               AND r."entityId" = ranked."id"
               AND r."status" IN ('PENDING', 'REVIEWING')
          )
        LIMIT ${batch}
     )
  `;
  return Number(deleted);
}

/** Prune every room's chat. Returns the number of messages deleted. */
export async function pruneRoomChat(now: Date = new Date(), batch: number = CHAT_PRUNE_BATCH): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY_MS);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = await pruneBatch(cutoff, batch);
    total += n;
    if (n < batch) break;
  }
  return total;
}

/** Register the nightly prune. Called once from the jobs worker (only it can schedule). */
export async function registerChatPruneCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(CHAT_PRUNE_QUEUE);
  await boss.schedule(CHAT_PRUNE_QUEUE, CHAT_PRUNE_CRON, {}, { tz: 'UTC' });
  await boss.work(CHAT_PRUNE_QUEUE, async () => {
    await pruneRoomChat();
  });
}
