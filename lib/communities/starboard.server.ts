/**
 * N2 — starboard (server-only).
 *
 * The ⭐ is the ordinary emoji reaction; there is no separate "star" action. On
 * each ⭐ toggle in a community post, {@link recordStarToggle} applies ONE
 * indexed upsert to `community_star_post` (insert seeded from the real reaction
 * count, otherwise ±1). Nothing ever scans reactions to build the hall of fame:
 * the board is a bounded read over `(communityId, starCount desc)`.
 *
 * A member's star on their own post does not count.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import { loadFlairsForPosts } from '@/lib/communities/flairs.server';
import { STAR_EMOJI } from '@/lib/communities/plus-schema';
import type { FeedItem } from '@/lib/feed-types';

const STAR_VS16 = `${STAR_EMOJI}️`;

export async function recordStarToggle(args: {
  postId: string;
  communityId: string;
  authorId: string;
  reactorId: string;
  /** True when the reaction was just added, false when removed. */
  reacted: boolean;
}): Promise<void> {
  if (args.reactorId === args.authorId) return;
  const delta = args.reacted ? 1 : -1;
  const rows = await prisma.$queryRaw<{ starCount: number }[]>`
    INSERT INTO community_star_post ("postId", "communityId", "starCount", "updatedAt")
    VALUES (
      ${args.postId},
      ${args.communityId},
      (SELECT COUNT(*)::int FROM rmheet_reaction
         WHERE "rmheetId" = ${args.postId}
           AND emoji IN (${STAR_EMOJI}, ${STAR_VS16})
           AND "userId" <> ${args.authorId}),
      now()
    )
    ON CONFLICT ("postId") DO UPDATE
      SET "starCount" = GREATEST(0, community_star_post."starCount" + ${delta}::int),
          "updatedAt" = now()
    RETURNING "starCount"
  `;
  const starCount = rows[0]?.starCount ?? 0;
  if (!args.reacted) return;

  // Tell the author once, at the moment the post crosses the threshold.
  const settings = await getCommunitySettings(args.communityId);
  if (settings && starCount === settings.starThreshold) {
    const post = await prisma.rMHark.findUnique({
      where: { id: args.postId },
      select: {
        user: { select: { handle: true } },
        community: { select: { slug: true, name: true } },
      },
    });
    if (post?.community) {
      await createNotification({
        userId: args.authorId,
        type: 'SYSTEM',
        entityType: 'rmhark',
        entityId: args.postId,
        preview: `Your post made the hall of fame in ${post.community.name}`,
        link: `/c/${post.community.slug}`,
      });
    }
  }
}

export interface HallOfFamePage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  threshold: number;
}

export async function getHallOfFame(
  communityId: string,
  viewerId: string | null,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<HallOfFamePage> {
  const limit = Math.min(opts.limit ?? 20, 40);
  const settings = await getCommunitySettings(communityId);
  const threshold = settings?.starThreshold ?? 5;
  const hidden = await getHiddenAuthorIds(viewerId);

  const rows = await prisma.communityStarPost.findMany({
    where: {
      communityId,
      starCount: { gte: threshold },
      post: { deletedAt: null, ...(hidden.length ? { userId: { notIn: hidden } } : {}) },
    },
    orderBy: [{ starCount: 'desc' }, { postId: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { postId: opts.cursor } } : {}),
    include: { post: { include: rmharkIncludeLite(viewerId) } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const posts = page.map((r) => r.post);
  const [items, flairs] = await Promise.all([
    mapRmharksWithBoundedReactions(posts, viewerId),
    loadFlairsForPosts(posts.map((p) => p.id)),
  ]);
  for (const item of items) {
    const flair = flairs.get(item.id);
    if (flair) item.communityFlair = flair;
  }
  return {
    items,
    nextCursor: hasMore ? (page[page.length - 1]?.postId ?? null) : null,
    hasMore,
    threshold,
  };
}
