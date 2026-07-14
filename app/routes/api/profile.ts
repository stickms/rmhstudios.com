import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateProfileSchema } from "@/lib/profile-schema";
import { handleSchema, canChangeHandle } from "@/lib/handle";

export const Route = createFileRoute('/api/profile')({
  server: {
    handlers: {
  PATCH: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "profile-update",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const {
      handle,
      displayName,
      bio,
      location,
      website,
      links,
      showLikes,
      dmPrivacy,
      profileSongSpotifyId,
      profileSongTitle,
      profileSongArtist,
      profileSongPreviewUrl,
      profileSongAlbumArt,
      tipGoal,
      tipGoalLabel,
      membershipPriceCoins,
    } = parsed.data;

    // Handle change logic
    let newHandle: string | undefined;
    if (handle !== undefined) {
      const handleValidation = handleSchema.safeParse(handle);
      if (!handleValidation.success) {
        return Response.json(
          { error: handleValidation.error.issues[0]?.message ?? "Invalid handle" },
          { status: 400 }
        );
      }

      // Check if handle actually changed
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { handle: true, handleChangedAt: true, isAdmin: true },
      });

      if (handle !== currentUser?.handle) {
        // Check cooldown
        if (!canChangeHandle(currentUser?.handleChangedAt ?? null, currentUser?.isAdmin ?? false)) {
          return Response.json(
            { error: "You can only change your handle once every two weeks" },
            { status: 429 }
          );
        }

        // Check uniqueness
        const existing = await prisma.user.findUnique({
          where: { handle },
          select: { id: true },
        });
        if (existing && existing.id !== session.user.id) {
          return Response.json(
            { error: "This handle is already taken" },
            { status: 409 }
          );
        }

        newHandle = handle;
      }
    }

    // Update handle on user model if changed
    if (newHandle) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { handle: newHandle, handleChangedAt: new Date() },
      });
    }

    const songFields = profileSongSpotifyId !== undefined
      ? {
          profileSongSpotifyId: profileSongSpotifyId || null,
          profileSongTitle: profileSongTitle || null,
          profileSongArtist: profileSongArtist || null,
          profileSongPreviewUrl: profileSongPreviewUrl || null,
          profileSongAlbumArt: profileSongAlbumArt || null,
        }
      : {};

    // Link-in-bio: `undefined` leaves it unchanged; an empty array clears it.
    const linksField = links !== undefined ? { links: links ?? [] } : {};

    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        displayName: displayName ?? null,
        bio: bio ?? null,
        location: location ?? null,
        website: website || null,
        showLikes: showLikes ?? false,
        ...linksField,
        ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
        ...(tipGoal !== undefined ? { tipGoal } : {}),
        ...(tipGoalLabel !== undefined ? { tipGoalLabel: tipGoalLabel || null } : {}),
        ...(membershipPriceCoins !== undefined ? { membershipPriceCoins: membershipPriceCoins || null } : {}),
        ...songFields,
      },
      update: {
        ...(displayName !== undefined ? { displayName: displayName ?? null } : {}),
        bio: bio ?? null,
        location: location ?? null,
        website: website || null,
        ...linksField,
        ...(showLikes !== undefined ? { showLikes } : {}),
        ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
        ...(tipGoal !== undefined ? { tipGoal } : {}),
        ...(tipGoalLabel !== undefined ? { tipGoalLabel: tipGoalLabel || null } : {}),
        ...(membershipPriceCoins !== undefined ? { membershipPriceCoins: membershipPriceCoins || null } : {}),
        ...songFields,
      },
    });

    return Response.json({
      ...(newHandle ? { handle: newHandle } : {}),
      displayName: profile.displayName,
      bio: profile.bio,
      location: profile.location,
      website: profile.website,
      links: profile.links ?? [],
      membershipPriceCoins: profile.membershipPriceCoins,
      showLikes: profile.showLikes,
      dmPrivacy: profile.dmPrivacy,
      profileSongSpotifyId: profile.profileSongSpotifyId,
      profileSongTitle: profile.profileSongTitle,
      profileSongArtist: profile.profileSongArtist,
      profileSongPreviewUrl: profile.profileSongPreviewUrl,
      profileSongAlbumArt: profile.profileSongAlbumArt,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
