/**
 * The lists a member is on (s13-11). Only lists anyone can see (`PUBLIC`, or `UNLISTED` by link) are ever shown to the
 * member: a private list is its owner's own note and stays invisible, even to someone on it. Leaving removes the
 * membership and records a `ListLeave`, which `addMember` and `replaceListMembers` (`lists.server.ts`) honour under the
 * list's membership lock, so the owner can never add the member back. The owner is not told.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { ListError, listMembersLockKey } from '@/lib/lists/lists.server';
import { LISTS_ON_PAGE, type ListOnRow, type ListsOnPage } from '@/lib/lists/lists-on';

/** What anyone but the owner may see of a list: public by either flag, or unlisted. */
const SEEN_BY_OTHERS = {
  OR: [{ isPublic: true }, { visibility: { in: ['PUBLIC', 'UNLISTED'] } }],
} satisfies Prisma.CustomFeedWhereInput;

type OwnerRow = Parameters<typeof resolveUser>[0];

/** The owner as the row shows them: the site's resolved display name and handle (a list may outlive its owner's row). */
function ownerOf(owner: OwnerRow | null): { name: string | null; handle: string | null } {
  if (!owner) return { name: null, handle: null };
  const u = resolveUser(owner);
  return { name: u.name, handle: u.handle };
}

function parseCursor(cursor: string | undefined): { at: Date; feedId: string } | null {
  if (!cursor) return null;
  const i = cursor.indexOf('|');
  if (i < 1) return null;
  const at = new Date(cursor.slice(0, i));
  const feedId = cursor.slice(i + 1);
  if (Number.isNaN(at.getTime()) || !feedId) return null;
  return { at, feedId };
}

/**
 * The public and unlisted lists that include the member, newest addition first, 50 a page. A list whose owner the
 * member blocks, or who blocks the member, is left out (blocking already took the membership; this covers a block
 * that landed since).
 */
export async function listsIAmOn(userId: string, cursor?: string): Promise<ListsOnPage> {
  const cur = parseCursor(cursor);
  const blocked = await getBlockedAuthorIds(userId);
  const rows = await prisma.customFeedMember.findMany({
    where: {
      userId,
      feed: { kind: 'list', ...SEEN_BY_OTHERS, ...(blocked.length ? { ownerId: { notIn: blocked } } : {}) },
      ...(cur ? { OR: [{ addedAt: { lt: cur.at } }, { addedAt: cur.at, feedId: { lt: cur.feedId } }] } : {}),
    },
    orderBy: [{ addedAt: 'desc' }, { feedId: 'desc' }],
    take: LISTS_ON_PAGE + 1,
    select: {
      feedId: true,
      addedAt: true,
      feed: { select: { id: true, name: true, owner: { select: userDisplaySelect } } },
    },
  });
  const page = rows.slice(0, LISTS_ON_PAGE);
  const last = page[page.length - 1];
  const lists: ListOnRow[] = page.map((r) => ({
    id: r.feed.id,
    name: r.feed.name,
    owner: ownerOf(r.feed.owner),
    addedAt: r.addedAt.toISOString(),
  }));
  return {
    lists,
    nextCursor: rows.length > LISTS_ON_PAGE && last ? `${last.addedAt.toISOString()}|${last.feedId}` : null,
  };
}

/**
 * Take the member off a list they are on and keep them off. Only a visible (public or unlisted) list they are on can
 * be left; anything else is `NOT_FOUND`, so a private list's existence is not revealed. Leaving twice is fine.
 */
export async function leaveList(userId: string, listId: string): Promise<void> {
  const list = await prisma.customFeed.findFirst({
    where: { id: listId, kind: 'list', ...SEEN_BY_OTHERS },
    select: { id: true },
  });
  if (!list) throw new ListError('NOT_FOUND');
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, listMembersLockKey(listId));
    const removed = await tx.customFeedMember.deleteMany({ where: { feedId: listId, userId } });
    if (removed.count === 0) {
      // Not on it any more: fine when they already left, otherwise there was nothing to leave.
      const earlier = await tx.listLeave.findUnique({ where: { feedId_userId: { feedId: listId, userId } } });
      if (!earlier) throw new ListError('NOT_FOUND');
      return;
    }
    await tx.listLeave.upsert({
      where: { feedId_userId: { feedId: listId, userId } },
      create: { feedId: listId, userId },
      update: {},
    });
  });
}

/** The data export: the lists the member left, with the list's name, its owner and when. */
export async function exportListsLeft(userId: string): Promise<{ list: string; owner: string | null; at: string }[]> {
  const rows = await prisma.listLeave.findMany({
    where: { userId },
    orderBy: { at: 'desc' },
    take: 1000,
    select: { at: true, feed: { select: { name: true, owner: { select: userDisplaySelect } } } },
  });
  return rows.map((r) => ({
    list: r.feed.name,
    owner: ownerOf(r.feed.owner).handle ?? ownerOf(r.feed.owner).name,
    at: r.at.toISOString(),
  }));
}

/** Account erasure: the member's leave rows. The rows on a list the member owns go with the list. */
export function listLeaveErasureOps(userId: string) {
  return [prisma.listLeave.deleteMany({ where: { userId } })];
}
