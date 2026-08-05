import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { ingest, IngestError } from '@/lib/media/ingest.server';

/**
 * POST /api/rmharks/image — the site's image upload endpoint.
 *
 * Despite the name it is not feed-only: the composer, the DM and group-chat
 * views, the announcement editor and the homes listing uploader all post here.
 *
 * Validation, metadata stripping, the WebP encode, the key and the store are
 * `lib/media/ingest.server.ts` under the `post` policy (C10) — this route used
 * to spell all five out, and so did five other upload routes, with slightly
 * different answers each time.
 *
 * One deliberate behaviour change came with that: an image sharp cannot decode
 * is now REFUSED. The old code caught the conversion failure and stored the
 * original bytes, which is the one path on this route that put un-re-encoded
 * camera output into public storage — GPS EXIF and all. The storage layer only
 * reliably strips JPEG (`compressForStorage`), so that fallback was the leak.
 * An image the encoder cannot read is a broken upload, and the honest answer is
 * to say so rather than to publish it intact.
 */

const MAX_IMAGES = 4;

export const Route = createFileRoute('/api/rmharks/image')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 10,
            windowMs: 60_000,
            prefix: 'rmhark-image-upload',
            message: 'Too many uploads. Try again later.',
          },
        },
        async ({ request, userId }) => {
          const formData = await request.formData();
          const files = formData
            .getAll('images')
            .filter((f): f is File => f instanceof File && f.size > 0);
          if (files.length === 0) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
          }
          if (files.length > MAX_IMAGES) {
            return Response.json(
              { error: `At most ${MAX_IMAGES} images per post.` },
              { status: 400 },
            );
          }

          const urls: string[] = [];
          try {
            // Sequential, as before: sharp is heavy, and four concurrent decodes
            // of 5 MB inputs is the shape of an out-of-memory report.
            for (const file of files) {
              const stored = await ingest(file, 'post', { userId });
              urls.push(stored.url);
            }
          } catch (err) {
            if (err instanceof IngestError) {
              return Response.json({ error: err.message }, { status: err.status });
            }
            throw err;
          }

          return Response.json({ urls });
        },
      ),
    },
  },
});
