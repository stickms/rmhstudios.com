/**
 * Lists & custom feeds — server logic (§3). List CRUD, membership, and a
 * lightweight list timeline (posts from the list's members, honoring audience).
 * The full PostCard-rendered timeline + pinned home tabs are the adoption
 * follow-up; this delivers the create->read vertical.
 */
import { prisma } from '@/lib/prisma.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { audienceWhere, circleOwnerIds } from '@/lib/feed/audience.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { MAX_LISTS, MAX_MEMBERS, MAX_PINNED, type ListView } from '@/lib/lists/constants';

export class ListError extends Error {}

export async function getUserLists(
  ownerId: string,
  targetUserId?: string,
): Promise<(ListView & { containsTarget?: boolean })[]> {
  const lists = await prisma.userList.findMany({
    where: { ownerId },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      bio: true,
      visibility: true,
      pinned: true,
      _count: { select: { members: true } },
      ...(targetUserId ? { members: { where: { userId: targetUserId }, select: { userId: true } } } : {}),
    },
  });
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    bio: l.bio,
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
  const count = await prisma.userList.count({ where: { ownerId } });
  if (count >= MAX_LISTS) throw new ListError('LIST_LIMIT');
  const list = await prisma.userList.create({
    data: { ownerId, name: data.name, bio: data.bio ?? null, visibility: data.visibility ?? 'PRIVATE' },
    select: { id: true, name: true, bio: true, visibility: true, pinned: true },
  });
  return { ...list, visibility: String(list.visibility), memberCount: 0, isOwner: true };
}

export async function updateList(
  ownerId: string,
  listId: string,
  data: { name?: string; bio?: string | null; visibility?: 'PRIVATE' | 'UNLISTED'; pinned?: boolean },
): Promise<void> {
  if (data.pinned === true) {
    const pinnedCount = await prisma.userList.count({ where: { ownerId, pinned: true, id: { not: listId } } });
    if (pinnedCount >= MAX_PINNED) throw new ListError('PIN_LIMIT');
  }
  const res = await prisma.userList.updateMany({ where: { id: listId, ownerId }, data });
  if (res.count === 0) throw new ListError('NOT_FOUND');
}

export async function deleteList(ownerId: string, listId: string): Promise<void> {
  const res = await prisma.userList.deleteMany({ where: { id: listId, ownerId } });
  if (res.count === 0) throw new ListError('NOT_FOUND');
}

export async function addMember(ownerId: string, listId: string, userId: string): Promise<void> {
  const list = await prisma.userList.findFirst({ where: { id: listId, ownerId }, select: { id: true } });
  if (!list) throw new ListError('NOT_FOUND');
  const count = await prisma.userListMember.count({ where: { listId } });
  if (count >= MAX_MEMBERS) throw new ListError('MEMBER_LIMIT');
  await prisma.userListMember.upsert({
    where: { listId_userId: { listId, userId } },
    create: { listId, userId },
    update: {},
  });
}

/** Remove a member. The list owner may remove anyone; a member may remove themselves. */
export async function removeMember(actorId: string, listId: string, userId: string): Promise<void> {
  const list = await prisma.userList.findUnique({ where: { id: listId }, select: { ownerId: true } });
  if (!list) throw new ListError('NOT_FOUND');
  if (list.ownerId !== actorId && userId !== actorId) throw new ListError('FORBIDDEN');
  await prisma.userListMember.deleteMany({ where: { listId, userId } });
}

export interface ListDetail {
  list: ListView;
  members: ResolvedUser[];
}

/** Resolve a list for a viewer, honoring visibility. Returns null if not visible. */
export async function getListDetail(listId: string, viewerId: string | null): Promise<ListDetail | null> {
  const list = await prisma.userList.findUnique({
    where: { id: listId },
    select: {
      id: true,
      ownerId: true,
      name: true,
      bio: true,
      visibility: true,
      pinned: true,
      _count: { select: { members: true } },
    },
  });
  if (!list) return null;
  const isOwner = viewerId === list.ownerId;
  if (!isOwner && list.visibility === 'PRIVATE') return null;

  const memberRows = await prisma.userListMember.findMany({
    where: { listId },
    orderBy: { addedAt: 'desc' },
    take: 200,
    select: { user: { select: userDisplaySelect } },
  });
  return {
    list: {
      id: list.id,
      name: list.name,
      bio: list.bio,
      visibility: String(list.visibility),
      pinned: list.pinned,
      memberCount: list._count.members,
      isOwner,
    },
    members: memberRows.map((m) => resolveUser(m.user)),
  };
}

export async function listsUserIsOn(userId: string): Promise<{ id: string; name: string; ownerHandle: string | null }[]> {
  const rows = await prisma.userListMember.findMany({
    where: { userId },
    select: { list: { select: { id: true, name: true, owner: { select: { handle: true } } } } },
    take: 100,
  });
  return rows.map((r) => ({ id: r.list.id, name: r.list.name, ownerHandle: r.list.owner?.handle ?? null }));
}

export interface ListTimelinePost {
  id: string;
  content: string;
  createdAt: string;
  author: ResolvedUser;
}

/** Lightweight chronological timeline of the list's members' posts. */
export async function listTimeline(
  viewerId: string | null,
  listId: string,
  cursor?: string,
): Promise<{ items: ListTimelinePost[]; nextCursor: string | null }> {
  const members = await prisma.userListMember.findMany({ where: { listId }, select: { userId: true } });
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) return { items: [], nextCursor: null };

  const [followingIds, circleIds] = await Promise.all([
    viewerId ? getFollowingIds(viewerId) : Promise.resolve([]),
    circleOwnerIds(viewerId),
  ]);

  const PAGE = 30;
  const rows = await prisma.rMHark.findMany({
    where: {
      userId: { in: memberIds },
      deletedAt: null,
      threadRootId: null,
      communityId: null,
      ...audienceWhere(viewerId, followingIds, [], circleIds),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, content: true, createdAt: true, user: { select: userDisplaySelect } },
  });
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  return {
    items: page.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      author: resolveUser(r.user),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
