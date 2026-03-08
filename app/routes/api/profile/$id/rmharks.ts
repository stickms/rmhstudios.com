import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { FeedItem, FeedPoll } from "@/lib/feed-types";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

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

const rmharkInclude = (viewerId: string | null) => ({
  user: { select: userDisplaySelect },
  _count: { select: { likes: true, comments: true, reposts: true, views: true } },
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
      _count: { select: { likes: true, comments: true, reposts: true, views: true } },
    },
  },
});

function mapOriginal(original: { id: string; createdAt: Date; content: string; user: Parameters<typeof resolveUser>[0]; _count: { likes: number; comments: number; reposts: number; views: number } } | null): FeedItem | undefined {
  if (!original) return undefined;
  return {
    id: original.id,
    type: "rmhark" as const,
    createdAt: original.createdAt.toISOString(),
    content: original.content,
    user: resolveUser(original.user),
    likeCount: original._count.likes,
    commentCount: original._count.comments,
    repostCount: original._count.reposts,
    viewCount: original._count.views,
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

    // Fetch user's own RMHarks and their reposts in parallel
    const [rmharks, reposts] = await Promise.all([
      prisma.rMHark.findMany({
        where: {
          userId,
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: rmharkInclude(viewerId),
      }),
      prisma.rMHarkRepost.findMany({
        where: {
          userId,
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
    const ownItems: FeedItem[] = rmharks.map((r: any) => ({
      id: r.id,
      type: "rmhark" as const,
      createdAt: r.createdAt.toISOString(),
      content: r.content,
      user: resolveUser(r.user),
      likeCount: r._count.likes,
      commentCount: r._count.comments,
      repostCount: r._count.reposts,
      viewCount: r._count.views,
      liked: viewerId ? r.likes.length > 0 : false,
      reposted: viewerId ? r.reposts.length > 0 : false,
      original: mapOriginal(r.original),
      poll: mapPoll(r.poll),
      gifUrl: r.gifUrl ?? undefined,
    }));

    // Map reposts to FeedItems with repostedBy
    const repostItems: FeedItem[] = reposts.map((rp: any) => {
      const r = rp.rmhark;
      return {
        id: `repost:${rp.id}`,
        type: "rmhark" as const,
        createdAt: rp.createdAt.toISOString(),
        actualId: r.id,
        content: r.content,
        user: resolveUser(r.user),
        likeCount: r._count.likes,
        commentCount: r._count.comments,
        repostCount: r._count.reposts,
        viewCount: r._count.views,
        liked: viewerId ? r.likes.length > 0 : false,
        reposted: viewerId ? r.reposts.length > 0 : false,
        repostedBy: resolveUser(rp.user),
        original: mapOriginal(r.original),
        poll: mapPoll(r.poll),
        gifUrl: r.gifUrl ?? undefined,
      };
    });

    // Merge and sort by createdAt descending, take limit
    const merged = [...ownItems, ...repostItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    const nextCursor =
      merged.length === limit
        ? merged[merged.length - 1].createdAt
        : null;

    return Response.json({
      items: merged,
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
