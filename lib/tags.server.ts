import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { audienceWhere } from '@/lib/feed/audience.server';
import type { FeedItem } from '@/lib/feed-types';

export interface TagFeedResult {
  tag: string;
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Posts containing #tag, newest first (cursor paginated), scoped to `viewerId`.
 *
 * Shared by the `/api/tags/$tag` GET handler and the `/tag/$tag` route loader so
 * the first page is server-rendered / prefetched instead of fetched client-side
 * on mount. FeedItem dates are already ISO strings from `mapRmharkToFeedItem`.
 */
export async function listTagFeed(
  rawTag: string,
  opts: { viewerId?: string | null; cursor?: string | null; limit?: number } = {}
): Promise<TagFeedResult> {
  // Normalize to how tags are stored (see lib/tags-extract.server.ts): strip a
  // leading '#', lowercase, and keep only tag-legal (Unicode) word chars.
  const tag = rawTag
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 64);
  if (!tag) return { tag: '', items: [], nextCursor: null, hasMore: false };

  const viewerId = opts.viewerId ?? null;
  const cursor = opts.cursor ?? null;
  const limit = Math.min(opts.limit ?? 20, 50);

  const hidden = await getHiddenAuthorIds(viewerId);
  const followingIds = viewerId
    ? (await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })).map((f) => f.followingId)
    : [];

  // Read the normalized hashtag links (post_hashtag → hashtag) instead of
  // scanning rmheet.content with ILIKE '%#tag%'. The join is exact, so no
  // word-boundary post-filter is needed. Keyset paginated on rmheet.createdAt.
  const rows = await prisma.rMHark.findMany({
    where: {
      deletedAt: null,
      hashtags: { some: { hashtag: { tag } } },
      ...(hidden.length ? { userId: { notIn: hidden } } : {}),
      ...audienceWhere(viewerId, followingIds),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: rmharkIncludeLite(viewerId),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapRmharksWithBoundedReactions(page, viewerId);

  return {
    tag,
    items,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    hasMore,
  };
}
