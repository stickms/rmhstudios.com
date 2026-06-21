import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import type { FeedItem, FeedPoll } from "@/lib/feed-types";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { audienceWhere } from "@/lib/feed/audience.server";
import { applyLock } from "@/lib/feed/map-feed-item.server";

function pollInclude(userId: string | null) {
  return {
    include: {
      options: {
        orderBy: { position: "asc" as const },
        include: {
          _count: { select: { votes: true } },
          ...(userId
            ? { votes: { where: { userId }, select: { id: true, optionId: true } } }
            : {}),
        },
      },
    },
  };
}

function mapPoll(poll: any): FeedPoll | undefined {
  if (!poll) return undefined;
  const totalVotes = poll.options.reduce(
    (sum: number, o: any) => sum + (o._count?.votes ?? 0),
    0
  );
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    totalVotes,
    options: poll.options.map((o: any) => ({
      id: o.id,
      text: o.text,
      voteCount: o._count?.votes ?? 0,
    })),
    myVotes: poll.options
      .filter((o: any) => o.votes?.length > 0)
      .map((o: any) => o.id),
  };
}

// Counts come from the denormalized columns on RMHark (Phase 1) so they're
// consistent with the main feed read path.
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
  original: {
    include: {
      user: { select: userDisplaySelect },
    },
  },
});

function mapOriginal(original: { id: string; createdAt: Date; content: string; user: Parameters<typeof resolveUser>[0]; likeCount: number; commentCount: number; repostCount: number; viewCount: number } | null): FeedItem | undefined {
  if (!original) return undefined;
  return {
    id: original.id,
    type: "rmhark" as const,
    createdAt: original.createdAt.toISOString(),
    content: original.content,
    user: resolveUser(original.user),
    likeCount: original.likeCount,
    commentCount: original.commentCount,
    repostCount: original.repostCount,
    viewCount: original.viewCount,
  };
}

export const Route = createFileRoute('/api/profile/$id/rmharks')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id: idOrHandle } = params;
    const resolvedUser = await prisma.user.findUnique({ where: { handle: idOrHandle }, select: { id: true } });
    const userId = resolvedUser?.id ?? idOrHandle;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Get viewer session (optional, for liked/reposted status)
    let viewerId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      viewerId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const cursorDate = cursor ? new Date(cursor) : undefined;

    // Audience: owner sees all; a follower also sees FOLLOWERS posts; others PUBLIC.
    let viewerFollowsOwner = false;
    if (viewerId && viewerId !== userId) {
      viewerFollowsOwner = !!(await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
        select: { id: true },
      }));
    }
    const aud = audienceWhere(viewerId, viewerFollowsOwner ? [userId] : []);

    // Fetch user's own RMHarks and their reposts in parallel (exclude deleted)
    const [rmharks, reposts] = await Promise.all([
      prisma.rMHark.findMany({
        where: {
          userId,
          deletedAt: null,
          ...aud,
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: rmharkInclude(viewerId),
      }),
      prisma.rMHarkRepost.findMany({
        where: {
          userId,
          rmhark: { deletedAt: null },
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: { select: userDisplaySelect },
          rmhark: {
            include: rmharkInclude(viewerId),
          },
        },
      }),
    ]);

    // Map own RMHarks to FeedItems
    const ownItems: FeedItem[] = rmharks.map((r: any) => applyLock({
      id: r.id,
      type: "rmhark" as const,
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
      original: mapOriginal(r.original),
      poll: mapPoll(r.poll),
      gifUrl: r.gifUrl ?? undefined,
    }, r, viewerId));

    // Map reposts to FeedItems with repostedBy
    const repostItems: FeedItem[] = reposts.map((rp: any) => {
      const r = rp.rmhark;
      return applyLock({
        id: `repost:${rp.id}`,
        type: "rmhark" as const,
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
        original: mapOriginal(r.original),
        poll: mapPoll(r.poll),
        gifUrl: r.gifUrl ?? undefined,
      }, r, viewerId);
    });

    // Merge and sort by createdAt descending, take limit
    const merged = [...ownItems, ...repostItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const nextCursor =
      merged.length === limit
        ? merged[merged.length - 1].createdAt
        : null;

    // On the first page, surface the user's pinned post at the very top
    // (deduped from the regular list below it).
    let items = merged;
    if (!cursorDate) {
      const pinned = await prisma.rMHark.findFirst({
        where: { userId, deletedAt: null, pinnedAt: { not: null }, ...aud },
        include: rmharkInclude(viewerId),
      });
      if (pinned) {
        const p: any = pinned;
        const pinnedItem: FeedItem = applyLock({
          id: p.id,
          type: "rmhark",
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
          original: mapOriginal(p.original),
          poll: mapPoll(p.poll),
          gifUrl: p.gifUrl ?? undefined,
        }, p, viewerId);
        items = [pinnedItem, ...merged.filter((it) => (it.actualId ?? it.id) !== p.id)];
      }
    }

    return Response.json({
      items,
      nextCursor,
      hasMore: merged.length === limit,
    });
  } catch (error) {
    console.error("Profile rmharks fetch error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
