/**
 * What a direct or group message said before an edit replaced it (s13-17).
 *
 * Posts work this way already: `RMHarkEdit` snapshots the previous body before `RMHark.content` is overwritten, so an
 * edit is a new version rather than a silent rewrite. A message edit needs the same property for the same reason,
 * otherwise "edit" is a way to make a report describe text that no longer exists anywhere.
 *
 * - `recordPriorRevision(tx, …)` is an insert inside the edit's own transaction, so an edit can never lose its prior
 *   text and a failed edit leaves no stray version.
 * - `readPriorRevisions` is **moderation paths only**: it is never part of a participant-facing payload, which is why
 *   the edit marker says only "edited".
 * - `pruneMessageEdits` is the nightly sweep: versions older than the moderation window go, except those of a message
 *   a `PENDING` or `REVIEWING` report names (they stay until the report is decided).
 * - `messageEditErasureOps` is the erasure record: the model has no `User` relation, so the account's own operation
 *   and `lib/account/__tests__/message-edits-erasure.test.ts` are the record of what happens to it.
 */
import type { PgBoss } from 'pg-boss';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

/** How long a prior revision stays readable. Matches the moderation window. */
export const EDIT_HISTORY_TTL_MS = 30 * 24 * 60 * 60_000;

/** Revisions kept per message: an edit war does not get unbounded storage. */
export const MAX_REVISIONS = 10;

/** Rows deleted per statement by the nightly prune. */
export const EDIT_PRUNE_BATCH = 1000;
/** Upper bound on batches in one run, so a bug cannot loop forever. */
const MAX_BATCHES = 1000;

export const EDIT_PRUNE_QUEUE = 'messages.edit-prune';
/** Daily at 04:43 UTC. */
export const EDIT_PRUNE_CRON = '43 4 * * *';

export interface PriorRevision {
  content: string;
  /** When this text was replaced (ISO 8601). */
  replacedAt: string;
}

/** The slice of a transaction client the snapshot needs. */
export type EditTx = Pick<Prisma.TransactionClient, 'chatMessageEdit'>;

/**
 * Snapshot the text a message had *before* an edit overwrites it. Call it inside the edit's transaction, right before
 * the update, so the snapshot and the overwrite commit together. Keeps the newest `MAX_REVISIONS` versions.
 */
export async function recordPriorRevision(
  tx: EditTx,
  messageId: string,
  content: string,
  now: Date = new Date(),
): Promise<void> {
  await tx.chatMessageEdit.create({ data: { messageId, content, replacedAt: now } });
  const stale = await tx.chatMessageEdit.findMany({
    where: { messageId },
    orderBy: [{ replacedAt: 'desc' }, { id: 'desc' }],
    skip: MAX_REVISIONS,
    select: { id: true },
  });
  if (stale.length > 0) {
    await tx.chatMessageEdit.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
}

/** The retained versions of a message, newest first, at most `MAX_REVISIONS`. **Moderation paths only.** */
export async function readPriorRevisions(messageId: string): Promise<PriorRevision[]> {
  const rows = await prisma.chatMessageEdit.findMany({
    where: { messageId },
    orderBy: [{ replacedAt: 'desc' }, { id: 'desc' }],
    take: MAX_REVISIONS,
    select: { content: true, replacedAt: true },
  });
  return rows.map((r) => ({ content: r.content, replacedAt: r.replacedAt.toISOString() }));
}

/** The retained versions of several messages at once, keyed by message id (newest first, at most `MAX_REVISIONS`). */
export async function readPriorRevisionsFor(messageIds: readonly string[]): Promise<Map<string, PriorRevision[]>> {
  const out = new Map<string, PriorRevision[]>();
  if (messageIds.length === 0) return out;
  const rows = await prisma.chatMessageEdit.findMany({
    where: { messageId: { in: [...messageIds] } },
    orderBy: [{ replacedAt: 'desc' }, { id: 'desc' }],
    select: { messageId: true, content: true, replacedAt: true },
  });
  for (const r of rows) {
    const list = out.get(r.messageId) ?? [];
    if (list.length < MAX_REVISIONS) list.push({ content: r.content, replacedAt: r.replacedAt.toISOString() });
    out.set(r.messageId, list);
  }
  return out;
}

/**
 * One batch of the prune: versions replaced before `cutoff` whose message no open report names. Raw SQL on the real
 * table (`"chat_message_edit"`, quoted columns), outside any transaction. Returns the number deleted.
 */
async function pruneBatch(cutoff: Date, batch: number): Promise<number> {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "chat_message_edit"
     WHERE "id" IN (
       SELECT e."id"
         FROM "chat_message_edit" e
        WHERE e."replacedAt" < ${cutoff}
          AND NOT EXISTS (
            SELECT 1
              FROM "content_report" r
             WHERE r."entityType" = 'dm'
               AND r."entityId" = e."messageId"
               AND r."status" IN ('PENDING', 'REVIEWING')
          )
        LIMIT ${batch}
     )
  `;
  return Number(deleted);
}

/** Delete the versions past the moderation window (batches of 1,000). Returns the number deleted. */
export async function pruneMessageEdits(now: Date = new Date(), batch: number = EDIT_PRUNE_BATCH): Promise<number> {
  const cutoff = new Date(now.getTime() - EDIT_HISTORY_TTL_MS);
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = await pruneBatch(cutoff, batch);
    total += n;
    if (n < batch) break;
  }
  return total;
}

/**
 * The erased member's edits: every earlier version of a message they sent. The messages stay under "Deleted user";
 * what they once said before an edit goes with the account.
 */
export function messageEditErasureOps(userId: string) {
  return [prisma.chatMessageEdit.deleteMany({ where: { message: { senderId: userId } } })];
}

/** Register the nightly prune. Called once from the jobs worker (only it can schedule). */
export async function registerMessageEditPruneCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(EDIT_PRUNE_QUEUE);
  await boss.schedule(EDIT_PRUNE_QUEUE, EDIT_PRUNE_CRON, {}, { tz: 'UTC' });
  await boss.work(EDIT_PRUNE_QUEUE, async () => {
    await pruneMessageEdits();
  });
}
