import { createFileRoute } from '@tanstack/react-router';
import { randomUUID } from 'node:crypto';
import { defineHandler } from '@/lib/api/handler.server';
import { validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { optimizeImage } from '@/lib/image-optimize';
import { logAdminAction } from '@/lib/admin-audit.server';
import { deleteObject, putObject } from '@/lib/storage/s3.server';
import { curatedBuildImageKey, isCuratedBuildKey } from '@/lib/storage/keys';

const BUILD_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// Build thumbnails render at card size — cap the long edge and store as WebP.
const BUILD_THUMB_MAX_DIM = 1280;

/**
 * Curated build thumbnail upload.
 *
 * Two fixes, both the same ones Slice It's uploads needed:
 *
 * - **It wrote to `db/builds` on the web container's local disk.** Production
 *   runs blue/green web containers, so a thumbnail uploaded to blue 404'd from
 *   green until the next deploy flipped back — the image would appear, vanish,
 *   and reappear across deploys. It goes to object storage now, which also puts
 *   it through the lossless compression pass in `putObject`.
 * - **It hand-rolled its auth and rate limit.** `auth: 'optional'` plus a manual
 *   `session.user as any).isAdmin` check plus a manual `rateLimit()` call is the
 *   preamble `defineHandler` exists to own; the cast in particular is the one
 *   `ApiUser` was introduced to delete.
 */
export const Route = createFileRoute('/api/admin/curated-builds/image')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'admin', rateLimit: 'upload' }, async ({ request, userId }) => {
        const formData = await request.formData();

        const file = formData.get('image');
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: 'No file provided' }, { status: 400 });
        }
        if (file.size > BUILD_IMAGE_MAX_BYTES) {
          return Response.json(
            {
              error: `Image too large. Maximum size is ${BUILD_IMAGE_MAX_BYTES / 1024 / 1024} MB.`,
            },
            { status: 400 },
          );
        }

        const rawBuffer = Buffer.from(await file.arrayBuffer());
        const validation = validateImageBuffer(rawBuffer);
        if (!validation.ok) {
          return Response.json({ error: validation.error }, { status: 400 });
        }

        // Re-encode to WebP at card size before storing; `putObject` then runs
        // the lossless pass over it.
        const { buffer } = await optimizeImage(rawBuffer, {
          width: BUILD_THUMB_MAX_DIM,
          height: BUILD_THUMB_MAX_DIM,
          format: 'webp',
          quality: 82,
          autoOrient: true,
        });

        // A UUID rather than the uploaded name: the key is a path, and the
        // name is attacker-controlled even behind an admin gate.
        const fileName = `build-${randomUUID()}.webp`;
        const key = curatedBuildImageKey(fileName);
        await putObject(key, buffer, 'image/webp');

        // Replace: drop the previous object once the new one is safely stored.
        const oldImageUrl = formData.get('oldImageUrl');
        if (typeof oldImageUrl === 'string' && oldImageUrl) {
          const prefix = '/api/admin/curated-builds/image/';
          const previous = oldImageUrl.startsWith(prefix) ? oldImageUrl.slice(prefix.length) : null;
          // Only ever delete something that is one of ours, and never the
          // object we just wrote.
          if (previous && previous !== fileName && /^[A-Za-z0-9._-]+$/.test(previous)) {
            const previousKey = isCuratedBuildKey(previous)
              ? previous
              : curatedBuildImageKey(previous);
            try {
              await deleteObject(previousKey);
            } catch {
              // An orphaned object is a storage-cost problem; failing the
              // upload over one would be the wrong trade.
            }
          }
        }

        const imageUrl = `/api/admin/curated-builds/image/${fileName}`;

        await logAdminAction(userId, 'curated-build.image-upload', {
          targetType: 'CuratedBuildImage',
          targetId: fileName,
        });

        return Response.json({ image: imageUrl });
      }),
    },
  },
});
