import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import type { FeedItem } from '@/lib/feed-types';
import { loadFlairsForPosts } from '@/lib/communities/flairs.server';

export interface CommunityAnnouncement {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string | null; handle: string | null; image: string | null };
}

export interface CommunityDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isPrivate: boolean;
  memberCount: number;
  createdById: string;
  createdAt: string;
  postCount: number;
  joined: boolean;
  role: string | null;
  announcements: CommunityAnnouncement[];
  /** P06: posting settings (columns on `community`, so no extra query). */
  flairRequired: boolean;
  starThreshold: number;
  verificationLevel: string;
  verificationValue: number;
}

/**
 * Community details + the viewer's membership. Shared by the
 * `/api/communities/$slug` GET handler and the `/c/$slug` route loader. Returns
 * `null` when the community doesn't exist.
 */
export async function getCommunity(
  slug: string,
  viewerId: string | null,
): Promise<CommunityDetail | null> {
  const community = await prisma.community.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
      color: true,
      isPrivate: true,
      memberCount: true,
      postCount: true,
      createdById: true,
      createdAt: true,
      flairRequired: true,
      starThreshold: true,
      verificationLevel: true,
      verificationValue: true,
    },
  });
  if (!community) return null;

  let role: string | null = null;
  if (viewerId) {
    const mem = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: viewerId } },
      select: { role: true },
    });
    role = mem?.role ?? null;
  }

  // Post count is the denormalized `community.postCount` column (maintained on
  // post create/delete), so this no longer runs COUNT(*) over rmheet per read.
  const announcements = await prisma.communityAnnouncement.findMany({
    where: { communityId: community.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { name: true, handle: true, image: true } },
    },
  });

  return {
    ...community,
    createdAt: community.createdAt.toISOString(),
    joined: !!role,
    role,
    announcements: announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}

export interface CommunityFeedResult {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * A community's posts (cursor-paginated). Shared by the
 * `/api/communities/$slug/feed` GET handler and the `/c/$slug` route loader.
 * Returns `null` when the community doesn't exist.
 */
export async function getCommunityFeed(
  slug: string,
  viewerId: string | null,
  opts: { cursor?: string | null; limit?: number; flairId?: string | null } = {},
): Promise<CommunityFeedResult | null> {
  const community = await prisma.community.findUnique({ where: { slug }, select: { id: true } });
  if (!community) return null;

  const limit = Math.min(opts.limit ?? 20, 50);
  // The viewer's membership rides the same round trip as the hidden-author
  // lookup; it only supplies the followed flairs (N3) for the first page.
  const [hidden, member] = await Promise.all([
    getHiddenAuthorIds(viewerId),
    viewerId && !opts.cursor && !opts.flairId
      ? prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId: community.id, userId: viewerId } },
          select: { followedFlairIds: true },
        })
      : Promise.resolve(null),
  ]);

  const rows = await prisma.rMHark.findMany({
    where: {
      communityId: community.id,
      deletedAt: null,
      ...(hidden.length ? { userId: { notIn: hidden } } : {}),
      ...(opts.flairId ? { communityFlair: { flairId: opts.flairId } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    include: rmharkIncludeLite(viewerId),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const [items, flairs] = await Promise.all([
    mapRmharksWithBoundedReactions(page, viewerId),
    loadFlairsForPosts(page.map((p) => p.id)),
  ]);
  for (const item of items) {
    const flair = flairs.get(item.id);
    if (flair) item.communityFlair = flair;
  }

  // N3: members who follow flairs see this page's posts in those flairs first
  // (a stable reorder of the page, so pagination and cursors are unchanged and
  // it costs no extra query — the flairs were loaded for the chips anyway).
  const followed = new Set(member?.followedFlairIds ?? []);
  const ordered =
    followed.size > 0
      ? [
          ...items.filter((i) => i.communityFlair && followed.has(i.communityFlair.id)),
          ...items.filter((i) => !(i.communityFlair && followed.has(i.communityFlair.id))),
        ]
      : items;
  return {
    items: ordered,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    hasMore,
  };
}
