import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import type { FeedItem } from "@/lib/feed-types";

export const runtime = "nodejs";

const rmheetInclude = (viewerId: string | null) => ({
  user: { select: { id: true, name: true, image: true, username: true } },
  _count: { select: { likes: true, comments: true, reposts: true, views: true } },
  ...(viewerId
    ? {
        likes: { where: { userId: viewerId }, select: { id: true } },
        reposts: { where: { userId: viewerId }, select: { id: true } },
      }
    : {}),
  original: {
    include: {
      user: { select: { id: true, name: true, image: true, username: true } },
      _count: { select: { likes: true, comments: true, reposts: true, views: true } },
    },
  },
});

function mapOriginal(original: { id: string; createdAt: Date; content: string; user: { id: string; name: string | null; image: string | null; username: string | null }; _count: { likes: number; comments: number; reposts: number; views: number } } | null): FeedItem | undefined {
  if (!original) return undefined;
  return {
    id: original.id,
    type: "rmheet" as const,
    createdAt: original.createdAt.toISOString(),
    content: original.content,
    user: original.user,
    likeCount: original._count.likes,
    commentCount: original._count.comments,
    repostCount: original._count.reposts,
    viewCount: original._count.views,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Get viewer session (optional, for liked/reposted status)
    let viewerId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      viewerId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const cursorDate = cursor ? new Date(cursor) : undefined;

    // Fetch user's own RMHeets and their reposts in parallel
    const [rmheets, reposts] = await Promise.all([
      prisma.rMHeet.findMany({
        where: {
          userId,
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: rmheetInclude(viewerId),
      }),
      prisma.rMHeetRepost.findMany({
        where: {
          userId,
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: { select: { id: true, name: true, image: true, username: true } },
          rmheet: {
            include: rmheetInclude(viewerId),
          },
        },
      }),
    ]);

    // Map own RMHeets to FeedItems
    const ownItems: FeedItem[] = rmheets.map((r) => ({
      id: r.id,
      type: "rmheet" as const,
      createdAt: r.createdAt.toISOString(),
      content: r.content,
      user: r.user,
      likeCount: r._count.likes,
      commentCount: r._count.comments,
      repostCount: r._count.reposts,
      viewCount: r._count.views,
      liked: viewerId ? r.likes.length > 0 : false,
      reposted: viewerId ? r.reposts.length > 0 : false,
      original: mapOriginal(r.original),
    }));

    // Map reposts to FeedItems with repostedBy
    const repostItems: FeedItem[] = reposts.map((rp) => {
      const r = rp.rmheet;
      return {
        id: `repost:${rp.id}`,
        type: "rmheet" as const,
        createdAt: rp.createdAt.toISOString(),
        actualId: r.id,
        content: r.content,
        user: r.user,
        likeCount: r._count.likes,
        commentCount: r._count.comments,
        repostCount: r._count.reposts,
        viewCount: r._count.views,
        liked: viewerId ? r.likes.length > 0 : false,
        reposted: viewerId ? r.reposts.length > 0 : false,
        repostedBy: rp.user,
        original: mapOriginal(r.original),
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

    return NextResponse.json({
      items: merged,
      nextCursor,
      hasMore: merged.length === limit,
    });
  } catch (error) {
    console.error("Profile rmheets fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
