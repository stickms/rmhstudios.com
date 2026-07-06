import { prisma } from '@/lib/prisma.server';
import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { applyLock } from '@/lib/feed/map-feed-item.server';

/* eslint-disable @typescript-eslint/no-explicit-any */

function pollInclude(userId: string | null) {
  return {
    include: {
      options: {
        orderBy: { position: 'asc' as const },
        include: {
          _count: { select: { votes: true } },
          ...(userId ? { votes: { where: { userId }, select: { id: true, optionId: true } } } : {}),
        },
      },
    },
  };
}

function mapPoll(poll: any): FeedPoll | undefined {
  if (!poll) return undefined;
  const totalVotes = poll.options.reduce((s: number, o: any) => s + (o._count?.votes ?? 0), 0);
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    totalVotes,
    options: poll.options.map((o: any) => ({ id: o.id, text: o.text, voteCount: o._count?.votes ?? 0 })),
    myVotes: poll.options.filter((o: any) => o.votes?.length > 0).map((o: any) => o.id),
  };
}

const rmharkInclude = (viewerId: string | null) => ({
  user: { select: userDisplaySelect },
  ...(viewerId
    ? {
        likes: { where: { userId: viewerId }, select: { id: true } },
        reposts: { where: { userId: viewerId }, select: { id: true } },
        unlocks: { where: { userId: viewerId }, select: { id: true } },
      }
    : {}),
  poll: pollInclude(viewerId),
  original: { include: { user: { select: userDisplaySelect } } },
});

/**
 * The viewer's bookmarked posts, newest-saved first (cursor-paginated). Shared
 * by the `/api/bookmarks` GET handler and the `/bookmarks` route loader so the
 * page is server-rendered / prefetched rather than fetched on mount.
 */
export async function listBookmarks(
  viewerId: string,
  opts: { cursor?: string | null; limit?: number } = {}
): Promise<{ items: FeedItem[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const bookmarks = await prisma.rMHarkBookmark.findMany({
    where: { userId: viewerId, rmhark: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    include: { rmhark: { include: rmharkInclude(viewerId) } },
  });

  const hasMore = bookmarks.length > limit;
  const page = hasMore ? bookmarks.slice(0, limit) : bookmarks;

  const items: FeedItem[] = page.map((bm) => {
    const r: any = bm.rmhark;
    return applyLock(
      {
        id: r.id,
        type: 'rmhark' as const,
        createdAt: r.createdAt.toISOString(),
        content: r.content,
        user: resolveUser(r.user),
        likeCount: r.likeCount,
        commentCount: r.commentCount,
        repostCount: r.repostCount,
        viewCount: r.viewCount,
        liked: r.likes?.length > 0,
        reposted: r.reposts?.length > 0,
        bookmarked: true,
        poll: mapPoll(r.poll),
        gifUrl: r.gifUrl ?? undefined,
        imageUrls: r.imageUrls ?? undefined,
      },
      r,
      viewerId
    );
  });

  return {
    items,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    hasMore,
  };
}
