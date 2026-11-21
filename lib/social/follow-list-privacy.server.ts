import { prisma } from '@/lib/prisma.server';
import {
  decideFollowListAccess,
  normalizeFollowListVisibility,
  type FollowListVisibility,
} from '@/lib/social/follow-list-privacy';

/** The owner's setting. A member with no profile row has never chosen one, so takes the default. */
export async function getFollowListVisibility(ownerId: string): Promise<FollowListVisibility> {
  const row = await prisma.userProfile.findUnique({
    where: { userId: ownerId },
    select: { followListVisibility: true },
  });
  return normalizeFollowListVisibility(row?.followListVisibility);
}

/**
 * Whether `viewerId` (null when signed out) may browse `ownerId`'s followers and following lists. The one decision
 * every path that reveals who follows whom goes through. Lookups run only when the answer needs them: `everyone` is
 * one profile read; `mutuals` is two indexed `follow` reads (`followerId_followingId`); an admin is checked last.
 */
export async function canSeeFollowLists(
  viewerId: string | null,
  ownerId: string,
  /** The owner's setting when the caller has already read it (the profile payload), to skip the repeat read. */
  knownVisibility?: FollowListVisibility,
): Promise<boolean> {
  if (viewerId !== null && viewerId === ownerId) return true;
  const visibility = knownVisibility ?? (await getFollowListVisibility(ownerId));
  if (visibility === 'everyone') return true;

  let viewerFollowsOwner = false;
  let ownerFollowsViewer = false;
  let viewerIsAdmin = false;
  if (viewerId !== null) {
    const [out, back, viewer] = await Promise.all([
      visibility === 'mutuals'
        ? prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: ownerId } },
            select: { id: true },
          })
        : null,
      visibility === 'mutuals'
        ? prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: ownerId, followingId: viewerId } },
            select: { id: true },
          })
        : null,
      prisma.user.findUnique({ where: { id: viewerId }, select: { isAdmin: true } }),
    ]);
    viewerFollowsOwner = out !== null;
    ownerFollowsViewer = back !== null;
    viewerIsAdmin = viewer?.isAdmin === true;
  }
  return decideFollowListAccess({
    visibility,
    viewerId,
    ownerId,
    viewerIsAdmin,
    viewerFollowsOwner,
    ownerFollowsViewer,
  });
}

/**
 * The ids in `ids` that are not in a blocked pair with the viewer (either direction), order kept. One `userBlock`
 * read over the page's ids, as `notifyWatchers` does. Signed out has no blocks.
 */
export async function filterBlocked(viewerId: string | null, ids: string[]): Promise<string[]> {
  if (viewerId === null || ids.length === 0) return ids;
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: { in: ids } },
        { blockerId: { in: ids }, blockedId: viewerId },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  if (blocks.length === 0) return ids;
  const hidden = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
  return ids.filter((id) => !hidden.has(id));
}
