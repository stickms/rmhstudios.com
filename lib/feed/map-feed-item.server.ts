/**
 * Shared RMHark → FeedItem mapping for read endpoints (tags, explore, etc.).
 * Mirrors the include/mapping used by the main timeline so cards render the same.
 */

import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export function rmharkInclude(viewerId: string | null) {
  return {
    user: { select: userDisplaySelect },
    ...(viewerId
      ? {
          likes: { where: { userId: viewerId }, select: { id: true } },
          reposts: { where: { userId: viewerId }, select: { id: true } },
          bookmarks: { where: { userId: viewerId }, select: { id: true } },
        }
      : {}),
    poll: {
      include: {
        options: {
          orderBy: { position: 'asc' as const },
          include: {
            _count: { select: { votes: true } },
            ...(viewerId ? { votes: { where: { userId: viewerId }, select: { id: true, optionId: true } } } : {}),
          },
        },
      },
    },
    original: { include: { user: { select: userDisplaySelect } } },
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

export function mapRmharkToFeedItem(r: any, viewerId: string | null): FeedItem {
  return {
    id: r.id,
    type: 'rmhark',
    createdAt: r.createdAt.toISOString(),
    content: r.content,
    user: resolveUser(r.user),
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    liked: viewerId ? r.likes?.length > 0 : false,
    reposted: viewerId ? r.reposts?.length > 0 : false,
    bookmarked: viewerId ? r.bookmarks?.length > 0 : false,
    edited: !!r.editedAt,
    original: r.original
      ? {
          id: r.original.id,
          type: 'rmhark',
          createdAt: r.original.createdAt.toISOString(),
          content: r.original.content,
          user: resolveUser(r.original.user),
          likeCount: r.original.likeCount,
          commentCount: r.original.commentCount,
          repostCount: r.original.repostCount,
          viewCount: r.original.viewCount,
        }
      : undefined,
    poll: mapPoll(r.poll),
    gifUrl: r.gifUrl ?? undefined,
    imageUrls: r.imageUrls ?? undefined,
  };
}
