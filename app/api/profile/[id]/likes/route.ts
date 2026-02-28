import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import type { FeedItem } from "@/lib/feed-types";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: profileUserId } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Get viewer session
    let viewerId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
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
        return NextResponse.json({ items: [], nextCursor: null, hasMore: false });
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

    const items: FeedItem[] = likes.map((l) => {
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

    return NextResponse.json({
      items,
      nextCursor,
      hasMore: items.length === limit,
    });
  } catch (error) {
    console.error("Profile likes fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
