import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserDisplay } from "@/lib/user-display";
import { handleCooldownRemaining } from "@/lib/handle";

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
      coins: true,
      hasProfilePet: true,
      showProfilePet: true,
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

export const Route = createFileRoute('/api/profile/$id')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id } = params;

    // Get viewer session (optional)
    let viewerId: string | null = null;
    let viewerIsAdmin = false;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
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
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const resolved = resolveUserDisplay(user);
    const isOwnProfile = viewerId === user.id;

    return Response.json({
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
      coins: user.profile?.coins ?? 10,
      hasProfilePet: user.profile?.hasProfilePet ?? false,
      showProfilePet: user.profile?.showProfilePet ?? true,
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
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
