import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idOrHandle } = await params;
    const resolvedUser = await prisma.user.findUnique({ where: { handle: idOrHandle }, select: { id: true } });
    const id = resolvedUser?.id ?? idOrHandle;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Get current viewer session for isFollowing status
    let viewerId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      viewerId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const followRecords = await prisma.follow.findMany({
      where: {
        followingId: id,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        follower: { select: userDisplaySelect },
      },
    });

    // Check which of these users the viewer follows
    let viewerFollowingSet = new Set<string>();
    if (viewerId && followRecords.length > 0) {
      const followerIds = followRecords.map((r) => r.follower.id);
      const viewerFollows = await prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: followerIds } },
        select: { followingId: true },
      });
      viewerFollowingSet = new Set(viewerFollows.map((f) => f.followingId));
    }

    const users = followRecords.map((r) => {
      const resolved = resolveUser(r.follower);
      return {
        ...resolved,
        isFollowing: viewerFollowingSet.has(resolved.id),
        isOwnProfile: resolved.id === viewerId,
      };
    });

    const nextCursor =
      followRecords.length === limit
        ? followRecords[followRecords.length - 1].createdAt.toISOString()
        : null;

    return NextResponse.json({
      users,
      nextCursor,
      hasMore: followRecords.length === limit,
    });
  } catch (error) {
    console.error("Fetch followers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
