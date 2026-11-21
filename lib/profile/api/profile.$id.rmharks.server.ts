import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import type { FeedItem, FeedPoll } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import {
  audienceWhere,
  communityVisibleWhere,
  viewerVisiblePostWhere,
} from '@/lib/feed/audience.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { mapQuotedOriginal, type QuotedOriginalRow } from '@/lib/feed/quoted-original';
import { applyLock, loadBoundedReactionSummaries } from '@/lib/feed/map-feed-item.server';
import { isExpired } from '@/lib/posts-plus/constants';
import { countsHiddenFrom, redactCounts } from '@/lib/feed/quiet-counts';
import { pollLifecycleView } from '@/lib/feed/poll-lifecycle';
import { rankedPollFields } from '@/lib/feed/ranked-poll';
import { PIN_LIMIT } from '@/lib/feed/profile-pins';

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
          ...(userId ? { votes: { where: { userId }, select: { id: true, optionId: true, rank: true } } } : {}),
        },
      },
    },
  };
}

function mapPoll(poll: any, countsHidden = false): FeedPoll | undefined {
  if (!poll) return undefined;
  const lifecycle = pollLifecycleView(poll);
  const totalVotes = poll.options.reduce((sum: number, o: any) => sum + (o.voteCount ?? 0), 0);
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    ...lifecycle,
    ...rankedPollFields(poll, { ended: lifecycle.ended, countsHidden }),
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

export const route = apiRoute('/api/profile/$id/rmharks', {
  GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId: viewerId }) => {
    const { id: idOrHandle } = params;
    const resolvedUser = await prisma.user.findUnique({
      where: { handle: idOrHandle },
      select: { id: true },
    });
    const userId = resolvedUser?.id ?? idOrHandle;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = pageSize(searchParams.get('limit'), 20, 50);

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
    // perf: the pinned posts (first page only) ride in the same parallel batch
    // instead of a serial query after the merge.
    const [rmharksRaw, repostsRaw, pinned] = await Promise.all([
      prisma.rMHark.findMany({
        where: {
          userId,
          deletedAt: null,
          // Pinned posts show first on page one and nowhere else, so no page repeats one.
          pinnedAt: null,
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
      // Up to three, in the member's order, under the same visibility as every other post on this page.
      cursorDate
        ? Promise.resolve([])
        : prisma.rMHark.findMany({
            where: {
              userId,
              deletedAt: null,
              pinnedAt: { not: null },
              // Past its expiry a pin is gone (it does not use up one of the three).
              AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
              ...aud,
            },
            orderBy: [{ pinnedAt: 'asc' }, { id: 'asc' }],
            take: PIN_LIMIT,
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
        ...pinned.map((p) => p.id),
      ],
      viewerId,
    );

    // One mapping for a member's own post, whether it comes up in the timeline or as a pin.
    const mapOwn = (r: any): FeedItem =>
      redactCounts(applyLock(
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
          poll: mapPoll(r.poll, countsHiddenFrom(r.userId, r.user?.profile?.hideCountsOnMine, viewerId)),
          gifUrl: r.gifUrl ?? undefined,
          gifAlt: r.gifAlt ?? undefined,
          imageUrls: r.imageUrls ?? undefined,
          imageAlts: r.imageAlts ?? undefined,
          isSensitive: r.isSensitive ?? false,
          contentWarning: r.contentWarning ?? undefined,
          isTake: r.isTake || undefined,
          seriesId: r.seriesId ?? undefined,
          expiresAt: r.expiresAt?.toISOString(),
          reactions: reactionSummaries.get(r.id) ?? [],
        },
        r,
        viewerId,
      ), viewerId);

    const ownItems: FeedItem[] = rmharks.map(mapOwn);

    // Map reposts to FeedItems with repostedBy
    const repostItems: FeedItem[] = reposts.map((rp: any) => {
      const r = rp.rmhark;
      return redactCounts(applyLock(
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
          poll: mapPoll(r.poll, countsHiddenFrom(r.userId, r.user?.profile?.hideCountsOnMine, viewerId)),
          gifUrl: r.gifUrl ?? undefined,
          gifAlt: r.gifAlt ?? undefined,
          imageUrls: r.imageUrls ?? undefined,
          imageAlts: r.imageAlts ?? undefined,
          isSensitive: r.isSensitive ?? false,
          contentWarning: r.contentWarning ?? undefined,
          isTake: r.isTake || undefined,
          seriesId: r.seriesId ?? undefined,
          expiresAt: r.expiresAt?.toISOString(),
          reactions: reactionSummaries.get(r.id) ?? [],
        },
        r,
        viewerId,
      ), viewerId);
    });

    // Merge and sort by createdAt descending, take limit
    const merged = [...ownItems, ...repostItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const nextCursor = merged.length === limit ? merged[merged.length - 1].createdAt : null;

    // On the first page, the member's pinned posts lead in their order; the timeline follows without them (the
    // query leaves pinned posts out), and a repost of a pinned post is not shown twice.
    let items = merged;
    if (pinned.length > 0) {
      const pinnedIds = new Set(pinned.map((p) => p.id));
      const pinnedItems = pinned.map((p, i) => ({ ...mapOwn(p), pinned: true, pinnedOrder: i + 1 }));
      items = [...pinnedItems, ...merged.filter((it) => !pinnedIds.has(it.actualId ?? it.id))];
    }

    return Response.json({
      items,
      nextCursor,
      hasMore: merged.length === limit,
    });
  }),
});
