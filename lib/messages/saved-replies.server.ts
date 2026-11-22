/**
 * Saved replies (sprint 05 #13): a member's private, titled texts for the DM and
 * group composers. Server-only.
 *
 * Every `where` carries `userId`, so another member's id answers 404 exactly as a
 * missing one does and nothing here can read or change a row that is not the
 * caller's. The cap is a check-then-insert, so it runs after `lockKey` in one
 * transaction; two requests at 49 cannot both pass. Replies are inserted into a
 * composer by the client and sent through the ordinary send path, so nothing in
 * this module sends a message.
 */

import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { MAX_SAVED_REPLIES, type SavedReplyRow } from '@/lib/messages/saved-replies';

type Row = {
  id: string;
  title: string;
  body: string;
  position: number;
  useCount: number;
  lastUsedAt: Date | null;
};

export type SavedReplyResult<T> =
  { ok: true; value: T } | { ok: false; status: 404 | 409 | 400; error: string; code?: string };

const NOT_FOUND = { ok: false, status: 404, error: 'Saved reply not found' } as const;

export function toSavedReplyRow(r: Row): SavedReplyRow {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    position: r.position,
    useCount: r.useCount,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
  };
}

const SELECT = { id: true, title: true, body: true, position: true, useCount: true, lastUsedAt: true } as const;

/** The member's replies in their own order. */
export async function listSavedReplies(userId: string): Promise<SavedReplyRow[]> {
  const rows = await prisma.savedReply.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: SELECT,
  });
  return rows.map(toSavedReplyRow);
}

/** Append a reply; refused with 409 `limit` when the member already keeps 50. */
export async function createSavedReply(
  userId: string,
  input: { title: string; body: string },
): Promise<SavedReplyResult<SavedReplyRow>> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, 'saved-replies:' + userId);
    const count = await tx.savedReply.count({ where: { userId } });
    if (count >= MAX_SAVED_REPLIES) {
      return {
        ok: false,
        status: 409,
        code: 'limit',
        error: `You can keep up to ${MAX_SAVED_REPLIES} saved replies`,
      } as const;
    }
    const last = await tx.savedReply.findFirst({
      where: { userId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const row = await tx.savedReply.create({
      data: { userId, title: input.title, body: input.body, position: (last?.position ?? -1) + 1 },
      select: SELECT,
    });
    return { ok: true, value: toSavedReplyRow(row) } as const;
  });
}

export async function updateSavedReply(
  userId: string,
  id: string,
  input: { title?: string | undefined; body?: string | undefined },
): Promise<SavedReplyResult<SavedReplyRow>> {
  const data: { title?: string; body?: string } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  const { count } = await prisma.savedReply.updateMany({ where: { id, userId }, data });
  if (count === 0) return NOT_FOUND;
  const row = await prisma.savedReply.findFirst({ where: { id, userId }, select: SELECT });
  return row ? { ok: true, value: toSavedReplyRow(row) } : NOT_FOUND;
}

export async function removeSavedReply(userId: string, id: string): Promise<SavedReplyResult<true>> {
  const { count } = await prisma.savedReply.deleteMany({ where: { id, userId } });
  return count === 0 ? NOT_FOUND : { ok: true, value: true };
}

/**
 * Put the listed replies first, in the order given, and keep the member's others after them in the order they had.
 * One transaction under the same lock as `create`. An id that is not the caller's refuses the whole call with 404 and
 * nothing is written.
 */
export async function reorderSavedReplies(
  userId: string,
  ids: readonly string[],
): Promise<SavedReplyResult<SavedReplyRow[]>> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, 'saved-replies:' + userId);
    const owned = await tx.savedReply.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((r) => r.id));
    if (ids.some((id) => !ownedIds.has(id))) return NOT_FOUND;
    const listed = new Set(ids);
    const order = [...ids, ...owned.map((r) => r.id).filter((id) => !listed.has(id))];
    for (const [position, id] of order.entries()) {
      await tx.savedReply.updateMany({ where: { id, userId }, data: { position } });
    }
    const rows = await tx.savedReply.findMany({ where: { userId }, orderBy: { position: 'asc' }, select: SELECT });
    return { ok: true, value: rows.map(toSavedReplyRow) } as const;
  });
}

/** A reply was inserted: bump its count and recency. */
export async function recordSavedReplyUse(userId: string, id: string): Promise<SavedReplyResult<true>> {
  const { count } = await prisma.savedReply.updateMany({
    where: { id, userId },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  return count === 0 ? NOT_FOUND : { ok: true, value: true };
}

/** The operations `anonymizeAccount` runs: the member's replies. Prisma operations only. */
export function savedReplyErasureOps(userId: string) {
  return [prisma.savedReply.deleteMany({ where: { userId } })];
}

/** The member's saved replies for the account export. */
export async function exportSavedReplies(userId: string): Promise<
  {
    title: string;
    body: string;
    position: number;
    useCount: number;
    lastUsedAt: string | null;
    createdAt: string;
  }[]
> {
  const rows = await prisma.savedReply.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { title: true, body: true, position: true, useCount: true, lastUsedAt: true, createdAt: true },
  });
  return rows.map((r) => ({
    title: r.title,
    body: r.body,
    position: r.position,
    useCount: r.useCount,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}
