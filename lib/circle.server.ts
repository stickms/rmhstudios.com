/**
 * Close Friends circle — server logic (§11). One private circle per owner.
 * Membership is silent (no notifications) and never publicly visible.
 */
import { prisma } from '@/lib/prisma.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { invalidateViewerFeedPages } from '@/lib/feed/timeline';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';

export const MAX_CIRCLE = 150;

export interface CircleData {
  members: ResolvedUser[];
  /** Candidate accounts to add — people the owner follows. */
  candidates: ResolvedUser[];
}

export async function getCircleData(ownerId: string): Promise<CircleData> {
  const [memberRows, followingIds] = await Promise.all([
    prisma.closeFriend.findMany({ where: { ownerId }, select: { memberId: true } }),
    getFollowingIds(ownerId),
  ]);
  const memberIds = new Set(memberRows.map((r) => r.memberId));
  // Candidate pool: everyone the owner follows (+ current members, in case a
  // member was later unfollowed but should still be manageable).
  const poolIds = Array.from(new Set([...followingIds, ...memberIds]));
  const users = poolIds.length
    ? await prisma.user.findMany({ where: { id: { in: poolIds } }, select: userDisplaySelect })
    : [];
  const resolved = users.map(resolveUser);
  return {
    members: resolved.filter((u) => memberIds.has(u.id)),
    candidates: resolved,
  };
}

export async function getCircleMemberIds(ownerId: string): Promise<string[]> {
  const rows = await prisma.closeFriend.findMany({ where: { ownerId }, select: { memberId: true } });
  return rows.map((r) => r.memberId);
}

export class CircleError extends Error {}

/** Replace the owner's circle (full set). Ids must be in the owner's follow graph. */
export async function setCircle(ownerId: string, userIds: string[]): Promise<void> {
  const unique = Array.from(new Set(userIds)).filter((id) => id && id !== ownerId);
  if (unique.length > MAX_CIRCLE) throw new CircleError('TOO_MANY');

  if (unique.length > 0) {
    // Validate: every id must follow the owner or be followed by the owner.
    const links = await prisma.follow.findMany({
      where: {
        OR: [
          { followerId: ownerId, followingId: { in: unique } },
          { followerId: { in: unique }, followingId: ownerId },
        ],
      },
      select: { followerId: true, followingId: true },
    });
    const valid = new Set<string>();
    for (const l of links) {
      if (l.followerId === ownerId) valid.add(l.followingId);
      else valid.add(l.followerId);
    }
    if (unique.some((id) => !valid.has(id))) throw new CircleError('NOT_IN_GRAPH');
  }

  // Members before the edit, to know whose cached feed pages this touches.
  const before = await getCircleMemberIds(ownerId);

  await prisma.$transaction([
    prisma.closeFriend.deleteMany({ where: { ownerId } }),
    ...(unique.length
      ? [
          prisma.closeFriend.createMany({
            data: unique.map((memberId) => ({ ownerId, memberId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  // What depends on circle membership, and how each stays correct:
  //  - `circleOwnerIds` (For-You / Following / lists / quotes) is NOT cached: it is
  //    read fresh on every assembly, so it needs nothing.
  //  - the cached signed-in first page is re-checked against the circle on every
  //    serve (lib/feed/page-reconcile.server.ts), so a member REMOVED from the
  //    circle stops seeing its posts immediately, with no invalidation.
  //  - a member ADDED would otherwise wait out the page's <=60s TTL before the
  //    circle's posts appear. Drop their cached pages (L1 + L2, every instance) so
  //    the change shows on their next load. Best-effort UX freshness only.
  const touched = new Set([...before, ...unique]);
  void Promise.all([...touched].map((id) => invalidateViewerFeedPages(id))).catch(() => {});
}
