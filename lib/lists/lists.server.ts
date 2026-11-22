/**
 * Lists — server logic (§3). A list is a Feed of kind 'list' (`CustomFeed`,
 * `lib/feeds/kinds.ts`) whose people are its `CustomFeedMember` rows. List
 * CRUD, membership, and a lightweight list timeline, paged by the same
 * `readFeedPage` every feed uses (posts from the members, honoring audience,
 * blocks and mutes).
 */
import { previewTextFor } from '@/lib/feed/content-warning';
import { prisma } from '@/lib/prisma.server';
import {
  feedSourceSelect,
  readFeedPage,
  readableByOthers,
  setFeedPeople,
  toFeedSource,
} from '@/lib/feeds/feeds.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { MAX_LISTS, MAX_MEMBERS, MAX_PINNED, type ListView } from '@/lib/lists/constants';

export class ListError extends Error {}

export async function getUserLists(
  ownerId: string,
  targetUserId?: string,
): Promise<(ListView & { containsTarget?: boolean })[]> {
  const lists = await prisma.customFeed.findMany({
    where: { ownerId, kind: 'list' },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      description: true,
      visibility: true,
      pinned: true,
      _count: { select: { members: true } },
      ...(targetUserId
        ? { members: { where: { userId: targetUserId }, select: { userId: true } } }
        : {}),
    },
  });
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    bio: l.description,
    visibility: String(l.visibility),
    pinned: l.pinned,
    memberCount: l._count.members,
    isOwner: true,
    ...(targetUserId
      ? { containsTarget: ((l as { members?: { userId: string }[] }).members?.length ?? 0) > 0 }
      : {}),
  }));
}

export async function createList(
  ownerId: string,
  data: { name: string; bio?: string; visibility?: 'PRIVATE' | 'UNLISTED' },
): Promise<ListView> {
  const count = await prisma.customFeed.count({ where: { ownerId, kind: 'list' } });
  if (count >= MAX_LISTS) throw new ListError('LIST_LIMIT');
  const list = await prisma.customFeed.create({
    data: {
      ownerId,
      kind: 'list',
      name: data.name,
      description: data.bio ?? null,
      visibility: data.visibility ?? 'PRIVATE',
      tags: [],
      keywords: [],
    },
    select: { id: true, name: true, description: true, visibility: true, pinned: true },
  });
  return {
    id: list.id,
    name: list.name,
    bio: list.description,
    visibility: String(list.visibility),
    pinned: list.pinned,
    memberCount: 0,
    isOwner: true,
  };
}

export async function updateList(
  ownerId: string,
  listId: string,
  data: {
    name?: string;
    bio?: string | null;
    visibility?: 'PRIVATE' | 'UNLISTED';
    pinned?: boolean;
  },
): Promise<void> {
  if (data.pinned === true) {
    const pinnedCount = await prisma.customFeed.count({
      where: { ownerId, kind: 'list', pinned: true, id: { not: listId } },
    });
    if (pinnedCount >= MAX_PINNED) throw new ListError('PIN_LIMIT');
  }
  const { bio, ...rest } = data;
  const res = await prisma.customFeed.updateMany({
    where: { id: listId, ownerId, kind: 'list' },
    data: { ...rest, ...(bio !== undefined ? { description: bio } : {}) },
  });
  if (res.count === 0) throw new ListError('NOT_FOUND');
}

export async function deleteList(ownerId: string, listId: string): Promise<void> {
  const res = await prisma.customFeed.deleteMany({ where: { id: listId, ownerId, kind: 'list' } });
  if (res.count === 0) throw new ListError('NOT_FOUND');
}

export async function addMember(ownerId: string, listId: string, userId: string): Promise<void> {
  const list = await prisma.customFeed.findFirst({
    where: { id: listId, ownerId, kind: 'list' },
    select: { id: true },
  });
  if (!list) throw new ListError('NOT_FOUND');
  const count = await prisma.customFeedMember.count({ where: { feedId: listId } });
  if (count >= MAX_MEMBERS) throw new ListError('MEMBER_LIMIT');
  await prisma.customFeedMember.upsert({
    where: { feedId_userId: { feedId: listId, userId } },
    create: { feedId: listId, userId },
    update: {},
  });
}

/**
 * Replace a list's members with exactly `userIds` (the developer API's one list write). Ownership and kind are
 * checked here, the cap applies to the whole set, and `setFeedPeople` does the delete-and-insert. Who may be a
 * member (blocks, bans, deleted accounts) is the caller's decision: this only stores the ids it is given.
 */
export async function replaceListMembers(ownerId: string, listId: string, userIds: string[]): Promise<void> {
  const list = await prisma.customFeed.findFirst({
    where: { id: listId, ownerId, kind: 'list' },
    select: { id: true },
  });
  if (!list) throw new ListError('NOT_FOUND');
  const unique = [...new Set(userIds)];
  if (unique.length > MAX_MEMBERS) throw new ListError('MEMBER_LIMIT');
  await setFeedPeople(listId, unique);
}

/** Remove a member. The list owner may remove anyone; a member may remove themselves. */
export async function removeMember(actorId: string, listId: string, userId: string): Promise<void> {
  const list = await prisma.customFeed.findFirst({
    where: { id: listId, kind: 'list' },
    select: { ownerId: true },
  });
  if (!list) throw new ListError('NOT_FOUND');
  if (list.ownerId !== actorId && userId !== actorId) throw new ListError('FORBIDDEN');
  await prisma.customFeedMember.deleteMany({ where: { feedId: listId, userId } });
}

export interface ListDetail {
  list: ListView;
  members: ResolvedUser[];
}

/** Resolve a list for a viewer, honoring visibility. Returns null if not visible. */
export async function getListDetail(
  listId: string,
  viewerId: string | null,
): Promise<ListDetail | null> {
  const list = await prisma.customFeed.findFirst({
    where: { id: listId, kind: 'list' },
    select: {
      id: true,
      ownerId: true,
      name: true,
      description: true,
      visibility: true,
      isPublic: true,
      pinned: true,
      _count: { select: { members: true } },
    },
  });
  if (!list) return null;
  const isOwner = viewerId === list.ownerId;
  if (!isOwner && !readableByOthers(list)) return null;

  const memberRows = await prisma.customFeedMember.findMany({
    where: { feedId: listId },
    orderBy: { addedAt: 'desc' },
    take: 200,
    select: { user: { select: userDisplaySelect } },
  });
  return {
    list: {
      id: list.id,
      name: list.name,
      bio: list.description,
      visibility: String(list.visibility),
      pinned: list.pinned,
      memberCount: list._count.members,
      isOwner,
    },
    members: memberRows.map((m) => resolveUser(m.user)),
  };
}

export async function listsUserIsOn(
  userId: string,
): Promise<{ id: string; name: string; ownerHandle: string | null }[]> {
  const rows = await prisma.customFeedMember.findMany({
    where: { userId, feed: { kind: 'list' } },
    select: { feed: { select: { id: true, name: true, owner: { select: { handle: true } } } } },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.feed.id,
    name: r.feed.name,
    ownerHandle: r.feed.owner?.handle ?? null,
  }));
}

export interface ListTimelinePost {
  id: string;
  content: string;
  createdAt: string;
  author: ResolvedUser;
}

const TIMELINE_PAGE = 30;

/** Lightweight chronological timeline of the list's members' posts (the shared feed reader). */
export async function listTimeline(
  viewerId: string | null,
  listId: string,
  cursor?: string,
): Promise<{ items: ListTimelinePost[]; nextCursor: string | null }> {
  const list = await prisma.customFeed.findUnique({
    where: { id: listId },
    select: feedSourceSelect,
  });
  if (!list) return { items: [], nextCursor: null };
  const { page, nextCursor } = await readFeedPage(toFeedSource(list), viewerId, {
    cursor,
    pageSize: TIMELINE_PAGE,
  });
  if (!page.length) return { items: [], nextCursor: null };
  const rows = await prisma.rMHark.findMany({
    where: { id: { in: page.map((p) => p.id) } },
    select: { id: true, content: true, contentWarning: true, createdAt: true, user: { select: userDisplaySelect } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    items: page
      .map((p) => byId.get(p.id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        // A list row cannot be revealed: a content warning reason stands in for the text (sprint 06 #16).
        content: previewTextFor(r) ?? '',
        createdAt: r.createdAt.toISOString(),
        author: resolveUser(r.user),
      })),
    nextCursor,
  };
}
