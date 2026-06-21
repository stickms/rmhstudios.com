import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

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
      }
    : {}),
  poll: pollInclude(viewerId),
  original: { include: { user: { select: userDisplaySelect } } },
});

/** GET /api/bookmarks — the current user's bookmarked posts (newest-saved first). */
export const Route = createFileRoute('/api/bookmarks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const viewerId = session.user.id;

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

          const bookmarks = await prisma.rMHarkBookmark.findMany({
            where: { userId: viewerId, rmhark: { deletedAt: null } },
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: { rmhark: { include: rmharkInclude(viewerId) } },
          });

          const hasMore = bookmarks.length > limit;
          const page = hasMore ? bookmarks.slice(0, limit) : bookmarks;

          const items: FeedItem[] = page.map((bm) => {
            const r: any = bm.rmhark;
            return {
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
            };
          });

          return Response.json({
            items,
            nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
            hasMore,
          });
        } catch (error) {
          console.error('Bookmarks fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
