/**
 * Deletion tombstones (s09-10): write one when a highlight, deck, card, bookmark or shelf entry is deleted, read them
 * back for `GET /api/v1/me/deleted`, prune them after 90 days. A tombstone is an id, a kind and a time, never content.
 *
 * Writes happen in the same transaction as the deletion where the deletion has one (highlight, card, bookmark, deck
 * with pictures) and straight after it where the deletion is a single statement (deck without pictures, shelf entry,
 * a bookmark removed through the saves API): the deletion's own row count decides, so a second delete writes nothing.
 */
import type { Prisma } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import {
  TOMBSTONE_PRUNE_BATCH,
  decodeTombstoneCursor,
  encodeTombstoneCursor,
  tombstoneWindowStart,
  type TombstoneKind,
} from '@/lib/sync/tombstones';

/** Either the client or an open transaction. */
type Db = Pick<Prisma.TransactionClient, 'syncTombstone'>;

export const TOMBSTONE_PRUNE_QUEUE = 'sync.tombstones.prune';
/** Daily at 03:41 UTC. */
export const TOMBSTONE_PRUNE_CRON = '41 3 * * *';

/** Record that `entityId` of `kind` was deleted for `userId`. Call only when the deletion removed a row. */
export async function recordTombstone(
  db: Db,
  userId: string,
  kind: TombstoneKind,
  entityId: string,
  deletedAt: Date = new Date(),
): Promise<void> {
  await db.syncTombstone.create({ data: { userId, kind, entityId, deletedAt } });
}

/** Several at once (a bulk bookmark clear). */
export async function recordTombstones(
  db: Db,
  userId: string,
  kind: TombstoneKind,
  entityIds: readonly string[],
  deletedAt: Date = new Date(),
): Promise<void> {
  if (entityIds.length === 0) return;
  await db.syncTombstone.createMany({ data: entityIds.map((entityId) => ({ userId, kind, entityId, deletedAt })) });
}

export interface ApiTombstone {
  id: string;
  kind: TombstoneKind;
  deletedAt: string;
}

/** The key owner's tombstones of one kind after `since`, oldest first, keyset on (`deletedAt`, `id`). */
export async function listTombstones(
  userId: string,
  kind: TombstoneKind,
  opts: { since: Date | null; cursor: string | undefined; limit: number },
  now: Date = new Date(),
): Promise<{ data: ApiTombstone[]; nextCursor: string | null } | 'invalid_cursor'> {
  const at = opts.cursor === undefined ? null : decodeTombstoneCursor(opts.cursor);
  if (opts.cursor !== undefined && !at) return 'invalid_cursor';
  // Rows past the window may not be pruned yet; they are never served, so a client sees one window.
  const from = opts.since && opts.since > tombstoneWindowStart(now) ? opts.since : tombstoneWindowStart(now);
  const and: Prisma.SyncTombstoneWhereInput[] = [{ deletedAt: { gt: from } }];
  if (at) and.push({ OR: [{ deletedAt: { gt: at.deletedAt } }, { deletedAt: at.deletedAt, id: { gt: at.id } }] });
  const rows = await prisma.syncTombstone.findMany({
    where: { userId, kind, AND: and },
    orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    take: opts.limit + 1,
    select: { id: true, entityId: true, deletedAt: true },
  });
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({ id: r.entityId, kind, deletedAt: r.deletedAt.toISOString() })),
    nextCursor: rows.length > opts.limit && last ? encodeTombstoneCursor(last.deletedAt, last.id) : null,
  };
}

/** Delete tombstones older than the window, `TOMBSTONE_PRUNE_BATCH` at a time. Returns how many went. */
export async function pruneTombstones(now: Date = new Date(), batch: number = TOMBSTONE_PRUNE_BATCH): Promise<number> {
  const cutoff = tombstoneWindowStart(now);
  let total = 0;
  for (;;) {
    const rows = await prisma.syncTombstone.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batch,
    });
    if (rows.length === 0) break;
    const { count } = await prisma.syncTombstone.deleteMany({
      where: { id: { in: rows.map((r) => r.id) }, deletedAt: { lt: cutoff } },
    });
    total += count;
    if (rows.length < batch) break;
  }
  return total;
}

/** Register the nightly prune. Called once from the jobs worker (only it can schedule). */
export async function registerTombstonePruneCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(TOMBSTONE_PRUNE_QUEUE);
  await boss.schedule(TOMBSTONE_PRUNE_QUEUE, TOMBSTONE_PRUNE_CRON, {}, { tz: 'UTC' });
  await boss.work(TOMBSTONE_PRUNE_QUEUE, async () => {
    await pruneTombstones();
  });
}
