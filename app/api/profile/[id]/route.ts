import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { resolveUserDisplay } from "@/lib/user-display";
import { handleCooldownRemaining } from "@/lib/handle";

export const runtime = "nodejs";

const profileSelect = {
  id: true,
  name: true,
  username: true,
  handle: true,
  handleChangedAt: true,
  image: true,
  isVerified: true,
  isAdmin: true,
  createdAt: true,
  profile: {
    select: {
      displayName: true,
      customImage: true,
      bio: true,
      location: true,
      website: true,
      showLikes: true,
      dmPrivacy: true,
      profileSongSpotifyId: true,
      profileSongTitle: true,
      profileSongArtist: true,
      profileSongPreviewUrl: true,
      profileSongAlbumArt: true,
    },
  },
  _count: {
    select: {
      followers: true,
      following: true,
      rmharks: true,
    },
  },
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get viewer session (optional)
    let viewerId: string | null = null;
    let viewerIsAdmin = false;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      viewerId = session?.user?.id ?? null;
      viewerIsAdmin = (session?.user as any)?.isAdmin ?? false;
    } catch {
      // Not logged in
    }

    // Try to find by handle first, then by ID
    let user = await prisma.user.findUnique({
      where: { handle: id },
      select: {
        ...profileSelect,
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
      user = await prisma.user.findUnique({
        where: { id },
        select: {
          ...profileSelect,
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
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const resolved = resolveUserDisplay(user);
    const isOwnProfile = viewerId === user.id;

    return NextResponse.json({
      id: user.id,
      name: resolved.name,
      username: user.username,
      handle: user.handle,
      image: resolved.image,
      isVerified: user.isVerified,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
      bio: user.profile?.bio ?? null,
      location: user.profile?.location ?? null,
      website: user.profile?.website ?? null,
      showLikes: user.profile?.showLikes ?? false,
      dmPrivacy: user.profile?.dmPrivacy ?? "EVERYONE",
      profileSongSpotifyId: user.profile?.profileSongSpotifyId ?? null,
      profileSongTitle: user.profile?.profileSongTitle ?? null,
      profileSongArtist: user.profile?.profileSongArtist ?? null,
      profileSongPreviewUrl: user.profile?.profileSongPreviewUrl ?? null,
      profileSongAlbumArt: user.profile?.profileSongAlbumArt ?? null,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      rmharkCount: user._count.rmharks,
      isFollowing: viewerId
        ? (user as Record<string, unknown>).followers
          ? ((user as Record<string, unknown>).followers as unknown[]).length > 0
          : false
        : false,
      isOwnProfile,
      // Handle change cooldown info (only for own profile)
      ...(isOwnProfile
        ? {
            handleCooldownMs: handleCooldownRemaining(user.handleChangedAt),
            hasCustomAvatar: !!user.profile?.customImage,
          }
        : {}),
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
