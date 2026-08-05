import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { ingest, IngestError } from '@/lib/media/ingest.server';
import { deleteObject, s3Configured } from '@/lib/storage/s3.server';
import { userAvatarKey, userAvatarFilename } from '@/lib/storage/keys';
import { purgeFromCdn } from '@/lib/storage/cdn.server';
import { invalidateUserDisplay } from '@/lib/user-display.server';

/**
 * The size ceiling, the accepted formats, the square WebP re-encode, the
 * `user-avatars/` key and the store are all the `avatar` policy in
 * `lib/media/ingest.server.ts` (C10). This route keeps only what is genuinely
 * its own: the global storage cap, retiring the previous avatar, and the
 * profile row.
 *
 * `strip: 'all'` on that policy is the part worth naming. An avatar is the one
 * image a member uploads *of themselves*, usually straight off a phone camera
 * roll, and it is public to everyone who can see any of their posts.
 */

const TOTAL_AVATAR_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

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
      POST: defineHandler(
        {
          rateLimit: {
            limit: 5,
            windowMs: 60_000,
            prefix: 'avatar-upload',
            message: 'Too many uploads. Try again later.',
          },
        },
        async ({ request, session }) => {
          const formData = await request.formData();
          const file = formData.get('avatar');
          if (!(file instanceof File) || file.size === 0) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
          }

          // Avatars are served from object storage (R2) behind cdn.rmhstudios.com — never
          // local disk. In production, refuse rather than silently fall back to the
          // local-filesystem backend (which would re-create the disk-bloat problem this
          // migration removes). Dev without S3 still works via the local fallback.
          if (process.env.NODE_ENV === 'production' && !s3Configured()) {
            console.error('Avatar upload blocked: object storage (S3_*) is not configured.');
            return Response.json(
              { error: 'Avatar storage is not configured. Please try again later.' },
              { status: 500 },
            );
          }

          let stored;
          try {
            stored = await ingest(file, 'avatar', {
              userId: session.user.id,
              // The global cap is measured against the bytes about to be
              // WRITTEN, not the bytes that arrived — a 5 MB JPEG lands as a
              // ~60 KB WebP. `reserve` runs after the encode and before the
              // put, so a refusal leaves nothing behind in storage.
              reserve: async (bytes) => {
                const { _sum } = await prisma.userProfile.aggregate({
                  _sum: { customImageSizeBytes: true },
                });
                return (_sum?.customImageSizeBytes ?? 0) + bytes > TOTAL_AVATAR_STORAGE_LIMIT_BYTES
                  ? 'Total avatar storage limit reached. Please try again later.'
                  : null;
              },
            });
          } catch (err) {
            if (err instanceof IngestError) {
              return Response.json({ error: err.message }, { status: err.status });
            }
            throw err;
          }

          // Retire the previous avatar object so storage doesn't accumulate.
          // After the new one is stored, not before: deleting first meant a
          // failed upload left the member with no avatar at all.
          const existingProfile = await prisma.userProfile.findUnique({
            where: { userId: session.user.id },
            select: { customImage: true },
          });
          await removeStoredAvatar(existingProfile?.customImage);

          const imageUrl = stored.url;
          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: {
              userId: session.user.id,
              customImage: imageUrl,
              customImageSizeBytes: stored.bytes,
            },
            update: {
              customImage: imageUrl,
              customImageSizeBytes: stored.bytes,
            },
          });

          // Refresh the cached feed author display so the new avatar shows immediately.
          invalidateUserDisplay(session.user.id);

          return Response.json({ image: imageUrl });
        },
      ),
      DELETE: defineHandler({}, async ({ session }) => {
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
          return Response.json({ image: '/images/social/default_avatar.png' });
        }

        return Response.json({ image: user?.image || '/images/social/default_avatar.png' });
      }),
    },
  },
});
