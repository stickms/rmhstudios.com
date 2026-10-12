/**
 * Profile guestbook (plan U15). Server-only.
 *
 * Off by default — a guestbook is something a person opens, not something a
 * profile has. Blocks run both ways (a blocked user can neither read nor sign),
 * the owner's mutes hide the muted author's entries from the owner, and the
 * owner can hide any entry. One entry per author per owner per day keeps a
 * guestbook from becoming a chat.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { createNotification } from '@/lib/notifications.server';
import {
  GUESTBOOK_PAGE,
  isGuestbookMode,
  type GuestbookMode,
  type GuestbookPage,
} from '@/lib/guestbook/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

async function modeOf(ownerId: string): Promise<GuestbookMode> {
  const row = await prisma.userProfile.findUnique({
    where: { userId: ownerId },
    select: { guestbookMode: true },
  });
  return isGuestbookMode(row?.guestbookMode) ? row.guestbookMode : 'off';
}

async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

/** Whether `viewerId` may sign `ownerId`'s guestbook under its current mode. */
async function maySign(ownerId: string, viewerId: string | null, mode: GuestbookMode) {
  if (!viewerId || viewerId === ownerId || mode === 'off') return false;
  if (await blockedEitherWay(ownerId, viewerId)) return false;
  if (mode === 'everyone') return true;
  // 'following' = people the OWNER follows.
  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: ownerId, followingId: viewerId } },
    select: { id: true },
  });
  return !!follow;
}

export async function readGuestbook(
  ownerId: string,
  viewerId: string | null,
  cursor: string | null,
): Promise<GuestbookPage | null> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) return null;
  const isOwner = viewerId === ownerId;
  const mode = await modeOf(ownerId);

  // A closed guestbook shows nothing to visitors; the owner still sees theirs.
  if (mode === 'off' && !isOwner) {
    return { mode, isOwner, canSign: false, entries: [], nextCursor: null };
  }
  if (viewerId && !isOwner && (await blockedEitherWay(ownerId, viewerId))) {
    return { mode, isOwner, canSign: false, entries: [], nextCursor: null };
  }

  const hiddenAuthors = await getHiddenAuthorIds(viewerId);
  const rows = await prisma.guestbookEntry.findMany({
    where: {
      ownerId,
      ...(isOwner ? {} : { hiddenAt: null }),
      ...(hiddenAuthors.length ? { authorId: { notIn: hiddenAuthors } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: GUESTBOOK_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      createdAt: true,
      hiddenAt: true,
      author: { select: userDisplaySelect },
    },
  });
  const hasMore = rows.length > GUESTBOOK_PAGE;
  const page = rows.slice(0, GUESTBOOK_PAGE);
  return {
    mode,
    isOwner,
    canSign: await maySign(ownerId, viewerId, mode),
    entries: page.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: resolveUser(r.author),
      hidden: !!r.hiddenAt,
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export type SignResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export async function signGuestbook(
  ownerId: string,
  authorId: string,
  body: string,
  now = new Date(),
): Promise<SignResult> {
  const mode = await modeOf(ownerId);
  if (!(await maySign(ownerId, authorId, mode))) {
    return { ok: false, status: 403, error: 'This guestbook is not open to you' };
  }
  const recent = await prisma.guestbookEntry.findFirst({
    where: { authorId, ownerId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    select: { id: true },
  });
  if (recent) {
    return { ok: false, status: 429, error: 'You can sign this guestbook once a day' };
  }
  const row = await prisma.guestbookEntry.create({
    data: { ownerId, authorId, body },
    select: { id: true },
  });
  void createNotification({
    userId: ownerId,
    actorId: authorId,
    type: 'SYSTEM',
    entityType: 'guestbook',
    entityId: row.id,
    preview: body,
    link: `/u/${ownerId}#guestbook`,
    groupKey: `guestbook:${ownerId}`,
  });
  return { ok: true, id: row.id };
}

/**
 * Owner: hide/unhide (soft — restorable). Author: delete their own entry.
 * Returns false when the caller is neither.
 */
export async function moderateEntry(
  entryId: string,
  callerId: string,
  action: 'hide' | 'unhide' | 'delete',
): Promise<boolean> {
  if (action === 'delete') {
    const res = await prisma.guestbookEntry.deleteMany({
      where: { id: entryId, authorId: callerId },
    });
    return res.count > 0;
  }
  const res = await prisma.guestbookEntry.updateMany({
    where: { id: entryId, ownerId: callerId },
    data: { hiddenAt: action === 'hide' ? new Date() : null },
  });
  return res.count > 0;
}

export async function setGuestbookMode(ownerId: string, mode: GuestbookMode): Promise<void> {
  await prisma.userProfile.upsert({
    where: { userId: ownerId },
    create: { userId: ownerId, guestbookMode: mode },
    update: { guestbookMode: mode },
  });
}
