import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { STAMP_MAX_UPLOAD_BYTES, stampNameSchema } from '@/lib/profile/stamps';
import { browseStamps, createStamp } from '@/lib/profile/stamps.server';

/**
 * GET  /api/stamps?sort=new|popular&cursor= — browse everyone's stamps (P5), so a
 *      member can collect them onto their wall.
 * POST /api/stamps — make a stamp. multipart/form-data: `image`, `name`. Strict
 *      size, dimension and format limits are enforced in `createStamp`.
 *
 * Reporting a stamp goes through the existing `/api/moderation/report` with
 * `entityType: 'stamp'`.
 */
const browseQuery = z.object({
  sort: z.enum(['new', 'popular']).default('new'),
  cursor: z.string().max(64).optional(),
});

export const Route = createFileRoute('/api/stamps/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: browseQuery },
        async ({ userId, query }) =>
          Response.json(
            await browseStamps({
              sort: query.sort,
              cursor: query.cursor ?? null,
              viewerId: userId,
            }),
            { headers: { 'Cache-Control': 'private, no-store' } },
          ),
      ),
      POST: defineHandler(
        {
          rateLimit: {
            limit: 6,
            windowMs: 60_000,
            prefix: 'stamp-create',
            message: 'Too many uploads. Try again in a minute.',
          },
        },
        async ({ request, userId }) => {
          const contentLength = Number(request.headers.get('content-length') ?? 0);
          if (contentLength > STAMP_MAX_UPLOAD_BYTES + 64 * 1024) {
            return Response.json({ error: 'That image is too large.' }, { status: 413 });
          }
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          const image = form.get('image');
          if (!(image instanceof File) || image.size === 0) {
            return Response.json({ error: 'No image provided' }, { status: 400 });
          }
          const name = stampNameSchema.safeParse(form.get('name'));
          if (!name.success) {
            return Response.json(
              { error: 'Give your stamp a name (up to 40 characters).' },
              { status: 400 },
            );
          }
          const result = await createStamp(userId, image, name.data);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ stamp: result.value }, { status: 201 });
        },
      ),
    },
  },
});
