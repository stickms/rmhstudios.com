import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { ingest, IngestError } from '@/lib/media/ingest.server';
import { nominate, photoPage } from '@/lib/delight/photo.server';

/**
 * GET  /api/photo-of-the-day — today's nominations, the viewer's vote, recent winners.
 * POST /api/photo-of-the-day (multipart: image, caption?) — upload an image as today's
 * nomination (photo-mode captures are downloads, so members upload the saved file).
 * The upload goes through the shared `post` ingest policy, so the member owns the URL.
 */
export const Route = createFileRoute('/api/photo-of-the-day/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await photoPage(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
        { rateLimit: { limit: 5, windowMs: 60_000, prefix: 'potd-upload', scope: 'user' } },
        async ({ request, userId }) => {
          const form = await request.formData();
          const file = form.get('image');
          if (!(file instanceof File) || file.size === 0) {
            return Response.json({ error: 'No image provided' }, { status: 400 });
          }
          const caption = String(form.get('caption') ?? '')
            .trim()
            .slice(0, 140);
          let url: string;
          try {
            url = (await ingest(file, 'post', { userId })).url;
          } catch (err) {
            if (err instanceof IngestError) {
              return Response.json({ error: err.message }, { status: err.status });
            }
            throw err;
          }
          const row = await nominate(userId, url, caption);
          if (!row)
            return Response.json({ error: 'You already nominated a photo today' }, { status: 409 });
          return Response.json({ id: row.id }, { status: 201 });
        },
      ),
    },
  },
});
