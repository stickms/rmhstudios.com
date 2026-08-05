/**
 * /api/emoji-packs/$slug/upload — upload one pack item image.
 *
 * Two steps rather than one (upload here, then POST the returned `mediaId` to
 * `items`) because the `Media` row is what gives a pack item the same
 * treatment as any other upload: the storage compressor, the per-user quota,
 * the orphan sweep, and — once it lands — upload-time classification. A route
 * that wrote a URL straight onto the pack would sidestep all four.
 *
 * Gated on `sticker-packs`: only members build packs.
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { putObject } from '@/lib/storage/s3.server';
import { optimizeImage } from '@/lib/image-optimize';
import { validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { createMediaFromUpload } from '@/lib/media/upload.server';
import { EMOJI_MAX_DIMENSION, STICKER_MAX_DIMENSION, ITEM_MAX_BYTES } from '@/lib/emoji/packs';

export const Route = createFileRoute('/api/emoji-packs/$slug/upload')({
  server: {
    handlers: {
      POST: defineHandler(
        { feature: 'sticker-packs', rateLimit: 'upload' },
        async ({ request, userId }) => {
          const form = await request.formData();
          const file = form.get('image');
          const kind = form.get('kind') === 'sticker' ? 'sticker' : 'emoji';

          if (!(file instanceof File) || file.size === 0) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
          }
          if (file.size > ITEM_MAX_BYTES) {
            return Response.json(
              { error: `Image too large. Maximum is ${Math.round(ITEM_MAX_BYTES / 1024)} KB.` },
              { status: 400 },
            );
          }

          const raw = Buffer.from(await file.arrayBuffer());
          const valid = validateImageBuffer(raw);
          if (!valid.ok) return Response.json({ error: valid.error }, { status: 400 });

          // Emoji render at ~20px inline and stickers at ~160px, so anything
          // larger is bytes nobody sees. Downscaled here rather than at render
          // time so the stored object is the small one.
          const max = kind === 'sticker' ? STICKER_MAX_DIMENSION : EMOJI_MAX_DIMENSION;
          const optimized = await optimizeImage(raw, {
            width: max,
            height: max,
            format: 'webp',
            quality: 90,
            animated: true,
          });

          const media = await createMediaFromUpload(
            { prisma, putObject },
            { userId, buffer: optimized.buffer },
          );

          return Response.json({ mediaId: media.id }, { status: 201 });
        },
      ),
    },
  },
});
