import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { loadBoundedReactionSummaries } from '@/lib/feed/map-feed-item.server';

function pollInclude(userId: string | null) {
  return {
    include: {
      options: {
        orderBy: { position: 'asc' as const },
        select: {
          id: true,
          text: true,
          // perf: denormalized tally (maintained by the vote route) instead of a
          // correlated COUNT per option.
          voteCount: true,
          ...(userId ? { votes: { where: { userId }, select: { id: true, optionId: true } } } : {}),
        },
      },
    },
  };
}

function mapPoll(poll: any): FeedPoll | undefined {
  if (!poll) return undefined;
  const totalVotes = poll.options.reduce((sum: number, o: any) => sum + (o.voteCount ?? 0), 0);
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    totalVotes,
    options: poll.options.map((o: any) => ({
      id: o.id,
      text: o.text,
      voteCount: o.voteCount ?? 0,
    })),
    myVotes: poll.options.filter((o: any) => o.votes?.length > 0).map((o: any) => o.id),
  };
}

export const Route = createFileRoute('/api/profile/$id/likes')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId: viewerId }) => {
        const { id: idOrHandle } = params;
        const resolvedUser = await prisma.user.findUnique({
          where: { handle: idOrHandle },
          select: { id: true },
        });
        const profileUserId = resolvedUser?.id ?? idOrHandle;
        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        // Fetch liked posts via RMHarkLike join.
        // perf: started before the visibility check so the two round trips overlap.
        const likesPromise = prisma.rMHarkLike.findMany({
          where: {
            userId: profileUserId,
            ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            rmhark: {
              include: {
                user: { select: userDisplaySelect },
                ...(viewerId
                  ? {
                      likes: { where: { userId: viewerId }, select: { id: true } },
                      reposts: { where: { userId: viewerId }, select: { id: true } },
                    }
                  : {}),
                poll: pollInclude(viewerId),
                original: {
                  include: {
                    user: { select: userDisplaySelect },
                  },
                },
              },
            },
          },
        });

        // Check visibility: allow if own profile or showLikes is true. The page
        // above is discarded if the profile hides its likes.
        const isOwnProfile = viewerId === profileUserId;
        if (!isOwnProfile) {
          const profile = await prisma.userProfile.findUnique({
            where: { userId: profileUserId },
            select: { showLikes: true },
          });
          if (!profile?.showLikes) {
            likesPromise.catch(() => {});
            return Response.json({ items: [], nextCursor: null, hasMore: false });
          }
        }

        const likes = await likesPromise;
        // perf: bounded groupBy summaries instead of including every reaction row.
        const reactionSummaries = await loadBoundedReactionSummaries(
          likes.map((l: any) => l.rmhark.id),
          viewerId,
        );

        const items: FeedItem[] = likes.map((l: any) => {
          const r = l.rmhark;
          return {
            id: r.id,
            type: 'rmhark' as const,
            createdAt: l.createdAt.toISOString(),
            content: r.content,
            user: resolveUser(r.user),
            likeCount: r.likeCount,
            commentCount: r.commentCount,
            repostCount: r.repostCount,
            viewCount: r.viewCount,
            liked: viewerId ? r.likes.length > 0 : false,
            reposted: viewerId ? r.reposts.length > 0 : false,
            edited: !!r.editedAt,
            poll: mapPoll(r.poll),
            gifUrl: r.gifUrl ?? undefined,
            imageUrls: r.imageUrls ?? undefined,
            imageAlts: r.imageAlts ?? undefined,
            isSensitive: r.isSensitive ?? false,
            reactions: reactionSummaries.get(r.id) ?? [],
            original: r.original
              ? {
                  id: r.original.id,
                  type: 'rmhark' as const,
                  createdAt: r.original.createdAt.toISOString(),
                  content: r.original.content,
                  user: resolveUser(r.original.user),
                  likeCount: r.original.likeCount,
                  commentCount: r.original.commentCount,
                  repostCount: r.original.repostCount,
                  viewCount: r.original.viewCount,
                }
              : undefined,
          };
        });

        const nextCursor =
          items.length === limit ? likes[likes.length - 1].createdAt.toISOString() : null;

        return Response.json({
          items,
          nextCursor,
          hasMore: items.length === limit,
        });
      }),
    },
  },
});
