import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get viewer session (optional)
    let viewerId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      viewerId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        createdAt: true,
        profile: {
          select: { bio: true, location: true, website: true },
        },
        _count: {
          select: {
            followers: true,
            following: true,
            rmheets: true,
          },
        },
        ...(viewerId
          ? {
              followers: {
                where: { followerId: viewerId },
                select: { id: true },
              },
            }
          : {}),
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      username: user.username,
      image: user.image,
      createdAt: user.createdAt.toISOString(),
      bio: user.profile?.bio ?? null,
      location: user.profile?.location ?? null,
      website: user.profile?.website ?? null,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      rmheetCount: user._count.rmheets,
      isFollowing: viewerId
        ? (user as Record<string, unknown>).followers
          ? ((user as Record<string, unknown>).followers as unknown[]).length > 0
          : false
        : false,
      isOwnProfile: viewerId === user.id,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
