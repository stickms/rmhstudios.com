import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
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
  const tag = rawTag.replace(/[^\w]/g, '').slice(0, 64);
  if (!tag) return { tag: '', items: [], nextCursor: null, hasMore: false };

  const viewerId = opts.viewerId ?? null;
  const cursor = opts.cursor ?? null;
  const limit = Math.min(opts.limit ?? 20, 50);

  const hidden = await getHiddenAuthorIds(viewerId);
  const followingIds = viewerId
    ? (await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })).map((f) => f.followingId)
    : [];

  const rows = await prisma.rMHark.findMany({
    where: {
      deletedAt: null,
      content: { contains: `#${tag}`, mode: 'insensitive' },
      ...(hidden.length ? { userId: { notIn: hidden } } : {}),
      ...audienceWhere(viewerId, followingIds),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: rmharkInclude(viewerId),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  // Guard against substring matches (#tag matching #tagged) — require a word boundary.
  const re = new RegExp(`#${tag}(?![\\w])`, 'i');
  const items = page
    .filter((r) => re.test(r.content))
    .map((r) => mapRmharkToFeedItem(r, viewerId));

  return {
    tag,
    items,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    hasMore,
  };
}
