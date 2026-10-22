import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { audienceWhere, communityVisibleWhere, viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { mapQuotedOriginal, type QuotedOriginalRow } from '@/lib/feed/quoted-original';
import { applyLock, loadBoundedReactionSummaries } from '@/lib/feed/map-feed-item.server';
import { isExpired } from '@/lib/posts-plus/constants';

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
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    totalVotes,
    options: poll.options.map((o: any) => ({
      id: o.id,
      text: o.text,
      voteCount: o.voteCount ?? 0,
    })),
    myVotes: poll.options.filter((o: any) => o.votes?.length > 0).map((o: any) => o.id),
  };
}

// Counts come from the denormalized columns on RMHark (Phase 1) so they're
// consistent with the main feed read path.
const rmharkInclude = (viewerId: string | null) => ({
  user: { select: userDisplaySelect },
  // Reactions loaded as bounded aggregates for the page (perf audit §2.3),
  // not fetched per row here.
  ...(viewerId
    ? {
        likes: { where: { userId: viewerId }, select: { id: true } },
        reposts: { where: { userId: viewerId }, select: { id: true } },
        unlocks: { where: { userId: viewerId }, select: { id: true } },
      }
    : {}),
  poll: pollInclude(viewerId),
  original: {
    include: {
      user: { select: userDisplaySelect },
      community: { select: { isPrivate: true } },
    },
  },
});

export const Route = createFileRoute('/api/profile/$id/rmharks')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId: viewerId }) => {
        const { id: idOrHandle } = params;
        const resolvedUser = await prisma.user.findUnique({
          where: { handle: idOrHandle },
          select: { id: true },
        });
        const userId = resolvedUser?.id ?? idOrHandle;
        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        const cursorDate = cursor ? new Date(cursor) : undefined;

        // Blocks apply to a profile's own posts and reposts like everywhere else: a
        // viewer who blocked this author, or was blocked by them, sees nothing of
        // theirs here (mutes stay feed-only).
        const blocked = await getBlockedAuthorIds(viewerId);
        if (viewerId && viewerId !== userId && blocked.includes(userId)) {
          return Response.json({ items: [], nextCursor: null, hasMore: false });
        }
        // Quote cards: one shared rule (lib/feed/quoted-original.ts).
        const quote = (o: (QuotedOriginalRow & { user: Parameters<typeof resolveUser>[0] }) | null) =>
          o ? mapQuotedOriginal(o, resolveUser(o.user), viewerId, blocked) : undefined;

        // Audience: owner sees all; a follower also sees FOLLOWERS posts; others PUBLIC.
        let viewerFollowsOwner = false;
        if (viewerId && viewerId !== userId) {
          viewerFollowsOwner = !!(await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
            select: { id: true },
          }));
        }
        // A private community's posts are members-only (profile lists reach them by author).
        const aud = {
          ...audienceWhere(viewerId, viewerFollowsOwner ? [userId] : []),
          ...communityVisibleWhere(viewerId),
        };
        // A repost shows someone else's post, so that post gets the full
        // visibility check (deleted, audience, blocks). Only deletedAt was
        // checked before, which let a profile's reposts reveal PRIVATE,
        // FOLLOWERS and CIRCLE posts to anyone who opened the tab.
        const repostedVisible = await viewerVisiblePostWhere(viewerId);

        // Fetch user's own RMHarks and their reposts in parallel (exclude deleted)
        // perf: the pinned post (first page only) rides in the same parallel batch
        // instead of a serial query after the merge.
        const [rmharksRaw, repostsRaw, pinned] = await Promise.all([
          prisma.rMHark.findMany({
            where: {
              userId,
              deletedAt: null,
              ...aud,
              ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: rmharkInclude(viewerId),
          }),
          prisma.rMHarkRepost.findMany({
            where: {
              userId,
              rmhark: repostedVisible,
              ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
              user: { select: userDisplaySelect },
              rmhark: {
                include: rmharkInclude(viewerId),
              },
            },
          }),
          cursorDate
            ? Promise.resolve(null)
            : prisma.rMHark.findFirst({
                where: { userId, deletedAt: null, pinnedAt: { not: null }, ...aud },
                include: rmharkInclude(viewerId),
              }),
        ]);

        // posts-plus X8: posts past their TTL are hidden at read time (the sweep
        // job soft-deletes them within minutes; this closes the gap).
        const rmharks = rmharksRaw.filter((r) => !isExpired(r.expiresAt));
        const reposts = repostsRaw.filter((rp) => !isExpired(rp.rmhark.expiresAt));

        // Bounded reaction summaries for every post on the page (own + the posts
        // underlying reposts), two aggregate queries total (perf audit §2.3).
        const reactionSummaries = await loadBoundedReactionSummaries(
          [
            ...rmharks.map((r: any) => r.id),
            ...reposts.map((rp: any) => rp.rmhark.id),
            ...(pinned ? [pinned.id] : []),
          ],
          viewerId,
        );

        // Map own RMHarks to FeedItems
        const ownItems: FeedItem[] = rmharks.map((r: any) =>
          applyLock(
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
              liked: viewerId ? r.likes.length > 0 : false,
              reposted: viewerId ? r.reposts.length > 0 : false,
              edited: !!r.editedAt,
              original: quote(r.original),
              poll: mapPoll(r.poll),
              gifUrl: r.gifUrl ?? undefined,
              imageUrls: r.imageUrls ?? undefined,
              imageAlts: r.imageAlts ?? undefined,
              isSensitive: r.isSensitive ?? false,
              isTake: r.isTake || undefined,
              seriesId: r.seriesId ?? undefined,
              expiresAt: r.expiresAt?.toISOString(),
              reactions: reactionSummaries.get(r.id) ?? [],
            },
            r,
            viewerId,
          ),
        );

        // Map reposts to FeedItems with repostedBy
        const repostItems: FeedItem[] = reposts.map((rp: any) => {
          const r = rp.rmhark;
          return applyLock(
            {
              id: `repost:${rp.id}`,
              type: 'rmhark' as const,
              createdAt: rp.createdAt.toISOString(),
              actualId: r.id,
              content: r.content,
              user: resolveUser(r.user),
              likeCount: r.likeCount,
              commentCount: r.commentCount,
              repostCount: r.repostCount,
              viewCount: r.viewCount,
              liked: viewerId ? r.likes.length > 0 : false,
              reposted: viewerId ? r.reposts.length > 0 : false,
              repostedBy: resolveUser(rp.user),
              original: quote(r.original),
              poll: mapPoll(r.poll),
              gifUrl: r.gifUrl ?? undefined,
              imageUrls: r.imageUrls ?? undefined,
              imageAlts: r.imageAlts ?? undefined,
              isSensitive: r.isSensitive ?? false,
              isTake: r.isTake || undefined,
              seriesId: r.seriesId ?? undefined,
              expiresAt: r.expiresAt?.toISOString(),
              reactions: reactionSummaries.get(r.id) ?? [],
            },
            r,
            viewerId,
          );
        });

        // Merge and sort by createdAt descending, take limit
        const merged = [...ownItems, ...repostItems]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limit);

        const nextCursor = merged.length === limit ? merged[merged.length - 1].createdAt : null;

        // On the first page, surface the user's pinned post at the very top
        // (deduped from the regular list below it).
        let items = merged;
        if (!cursorDate) {
          if (pinned) {
            const p: any = pinned;
            const pinnedItem: FeedItem = applyLock(
              {
                id: p.id,
                type: 'rmhark',
                createdAt: p.createdAt.toISOString(),
                content: p.content,
                user: resolveUser(p.user),
                likeCount: p.likeCount,
                commentCount: p.commentCount,
                repostCount: p.repostCount,
                viewCount: p.viewCount,
                liked: viewerId ? p.likes.length > 0 : false,
                reposted: viewerId ? p.reposts.length > 0 : false,
                edited: !!p.editedAt,
                pinned: true,
                original: quote(p.original),
                poll: mapPoll(p.poll),
                gifUrl: p.gifUrl ?? undefined,
                imageUrls: p.imageUrls ?? undefined,
                imageAlts: p.imageAlts ?? undefined,
                isSensitive: p.isSensitive ?? false,
                isTake: p.isTake || undefined,
                seriesId: p.seriesId ?? undefined,
                expiresAt: p.expiresAt?.toISOString(),
                reactions: reactionSummaries.get(p.id) ?? [],
              },
              p,
              viewerId,
            );
            items = [pinnedItem, ...merged.filter((it) => (it.actualId ?? it.id) !== p.id)];
          }
        }

        return Response.json({
          items,
          nextCursor,
          hasMore: merged.length === limit,
        });
      }),
    },
  },
});
