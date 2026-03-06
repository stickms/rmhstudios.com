import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateProfileSchema } from "@/lib/profile-schema";
import { handleSchema, canChangeHandle } from "@/lib/handle";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "profile-update",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
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
      showLikes,
      dmPrivacy,
      profileSongSpotifyId,
      profileSongTitle,
      profileSongArtist,
      profileSongPreviewUrl,
      profileSongAlbumArt,
      showProfilePet,
    } = parsed.data;

    // Handle change logic
    let newHandle: string | undefined;
    if (handle !== undefined) {
      const handleValidation = handleSchema.safeParse(handle);
      if (!handleValidation.success) {
        return NextResponse.json(
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
          return NextResponse.json(
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
          return NextResponse.json(
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

    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        displayName: displayName ?? null,
        bio: bio ?? null,
        location: location ?? null,
        website: website || null,
        showLikes: showLikes ?? false,
        ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
        ...(showProfilePet !== undefined ? { showProfilePet } : {}),
        ...songFields,
      },
      update: {
        ...(displayName !== undefined ? { displayName: displayName ?? null } : {}),
        bio: bio ?? null,
        location: location ?? null,
        website: website || null,
        ...(showLikes !== undefined ? { showLikes } : {}),
        ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
        ...(showProfilePet !== undefined ? { showProfilePet } : {}),
        ...songFields,
      },
    });

    return NextResponse.json({
      ...(newHandle ? { handle: newHandle } : {}),
      displayName: profile.displayName,
      bio: profile.bio,
      location: profile.location,
      website: profile.website,
      showLikes: profile.showLikes,
      dmPrivacy: profile.dmPrivacy,
      profileSongSpotifyId: profile.profileSongSpotifyId,
      profileSongTitle: profile.profileSongTitle,
      profileSongArtist: profile.profileSongArtist,
      profileSongPreviewUrl: profile.profileSongPreviewUrl,
      profileSongAlbumArt: profile.profileSongAlbumArt,
      hasProfilePet: profile.hasProfilePet,
      showProfilePet: profile.showProfilePet,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
