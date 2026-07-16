import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateImageBuffer } from "@/lib/slice-it/upload-validation";
import { optimizeImage } from "@/lib/image-optimize";
import { putObject, deleteObject, s3Configured } from "@/lib/storage/s3.server";
import { userAvatarKey, userAvatarUrl, userAvatarFilename } from "@/lib/storage/keys";
import { purgeFromCdn } from "@/lib/storage/cdn.server";
import { invalidateUserDisplay } from "@/lib/user-display.server";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image
const TOTAL_AVATAR_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
// Square avatar, matching the persona-avatar pipeline (lib/personas/avatar.server.ts).
const AVATAR_SIZE = 512;

/** Best-effort removal of an avatar object from storage + CDN edge, by stored URL. */
async function removeStoredAvatar(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const filename = userAvatarFilename(url);
  if (!filename) return;
  const key = userAvatarKey(filename);
  try {
    await deleteObject(key);
  } catch {
    // Object may already be gone — non-fatal.
  }
  await purgeFromCdn(key);
}

export const Route = createFileRoute('/api/profile/avatar')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 5,
      windowMs: 60_000,
      prefix: "avatar-upload",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many uploads. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File;
    if (!file || file.size === 0) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > AVATAR_MAX_BYTES) {
      return Response.json(
        {
          error: `Avatar too large. Maximum size is ${AVATAR_MAX_BYTES / 1024 / 1024} MB.`,
        },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const validation = validateImageBuffer(rawBuffer);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // Avatars are served from object storage (R2) behind cdn.rmhstudios.com — never
    // local disk. In production, refuse rather than silently fall back to the
    // local-filesystem backend (which would re-create the disk-bloat problem this
    // migration removes). Dev without S3 still works via the local fallback.
    if (process.env.NODE_ENV === "production" && !s3Configured()) {
      console.error("Avatar upload blocked: object storage (S3_*) is not configured.");
      return Response.json(
        { error: "Avatar storage is not configured. Please try again later." },
        { status: 500 }
      );
    }

    // Compress every upload to a square WebP regardless of source format — shrinks
    // storage/bandwidth and normalizes content type (matches persona avatars).
    const { buffer, contentType } = await optimizeImage(rawBuffer, {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      format: "webp",
      quality: 82,
      autoOrient: true,
    });

    // Enforce total avatar storage cap against the COMPRESSED size we'll store.
    const { _sum } = await prisma.userProfile.aggregate({
      _sum: { customImageSizeBytes: true },
    });
    const currentTotal = _sum?.customImageSizeBytes ?? 0;
    if (currentTotal + buffer.length > TOTAL_AVATAR_STORAGE_LIMIT_BYTES) {
      return Response.json(
        { error: "Total avatar storage limit reached. Please try again later." },
        { status: 413 }
      );
    }

    // Remove the previous avatar object (if any) so storage doesn't accumulate.
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { customImage: true },
    });
    await removeStoredAvatar(existingProfile?.customImage);

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileName = `${session.user.id}-${uniqueSuffix}.webp`;
    await putObject(userAvatarKey(fileName), buffer, contentType);
    const imageUrl = userAvatarUrl(fileName);

    // Upsert UserProfile with custom image
    await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        customImage: imageUrl,
        customImageSizeBytes: buffer.length,
      },
      update: {
        customImage: imageUrl,
        customImageSizeBytes: buffer.length,
      },
    });

    // Refresh the cached feed author display so the new avatar shows immediately.
    invalidateUserDisplay(session.user.id);

    return Response.json({ image: imageUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
  DELETE: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { customImage: true },
    });

    if (!profile?.customImage) {
      return Response.json({ image: null });
    }

    // Delete the avatar object from storage + purge the CDN edge.
    await removeStoredAvatar(profile.customImage);

    // Clear custom image in DB
    await prisma.userProfile.update({
      where: { userId: session.user.id },
      data: { customImage: null, customImageSizeBytes: null },
    });

    // Refresh the cached feed author display so the reverted avatar shows now.
    invalidateUserDisplay(session.user.id);

    // If User.image was corrupted by old code (overwritten with custom avatar URL),
    // clear it so it doesn't 404
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true },
    });
    if (user?.image && userAvatarFilename(user.image) !== null) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { image: null },
      });
      return Response.json({ image: "/images/social/default_avatar.png" });
    }

    return Response.json({ image: user?.image || "/images/social/default_avatar.png" });
  } catch (error) {
    console.error("Avatar reset error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
