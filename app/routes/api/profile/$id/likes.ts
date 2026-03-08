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

export const Route = createFileRoute('/api/profile/$id/likes')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id: idOrHandle } = params;
    const resolvedUser = await prisma.user.findUnique({ where: { handle: idOrHandle }, select: { id: true } });
    const profileUserId = resolvedUser?.id ?? idOrHandle;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Get viewer session
    let viewerId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      viewerId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    // Check visibility: allow if own profile or showLikes is true
    const isOwnProfile = viewerId === profileUserId;
    if (!isOwnProfile) {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: profileUserId },
        select: { showLikes: true },
      });
      if (!profile?.showLikes) {
        return Response.json({ items: [], nextCursor: null, hasMore: false });
      }
    }

    // Fetch liked posts via RMHarkLike join
    const likes = await prisma.rMHarkLike.findMany({
      where: {
        userId: profileUserId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        rmhark: {
          include: {
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
          },
        },
      },
    });

    const items: FeedItem[] = likes.map((l: any) => {
      const r = l.rmhark;
      return {
        id: r.id,
        type: "rmhark" as const,
        createdAt: l.createdAt.toISOString(),
        content: r.content,
        user: resolveUser(r.user),
        likeCount: r._count.likes,
        commentCount: r._count.comments,
        repostCount: r._count.reposts,
        viewCount: r._count.views,
        liked: viewerId ? r.likes.length > 0 : false,
        reposted: viewerId ? r.reposts.length > 0 : false,
        poll: mapPoll(r.poll),
        gifUrl: r.gifUrl ?? undefined,
        original: r.original
          ? {
              id: r.original.id,
              type: "rmhark" as const,
              createdAt: r.original.createdAt.toISOString(),
              content: r.original.content,
              user: resolveUser(r.original.user),
              likeCount: r.original._count.likes,
              commentCount: r.original._count.comments,
              repostCount: r.original._count.reposts,
              viewCount: r.original._count.views,
            }
          : undefined,
      };
    });

    const nextCursor =
      items.length === limit
        ? likes[likes.length - 1].createdAt.toISOString()
        : null;

    return Response.json({
      items,
      nextCursor,
      hasMore: items.length === limit,
    });
  } catch (error) {
    console.error("Profile likes fetch error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
