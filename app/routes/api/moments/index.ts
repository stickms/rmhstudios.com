import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { createMomentSchema } from '@/lib/moments-schema';
import { createMomentApi } from '@/lib/moments.contract';
import { SITE_URL } from '@/lib/seo';
import { createMoment } from '@/lib/moments.server';

/**
 * POST /api/moments — create a shared moment (Shareable stat cards, §13).
 * Only ever called when the user chooses to share. Returns the moment id and its
 * public landing URL (which unfurls via /api/og/moment/$id).
 */
export const Route = createFileRoute('/api/moments/')({
  server: {
    handlers: {
      POST: implement(
        createMomentApi,
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'moments-create' },
          body: createMomentSchema,
        },
        async ({ userId, body }) => {
          try {
            const { id } = await createMoment({
              userId,
              kind: body.kind,
              payload: body.payload,
            });
            return { id, url: `${SITE_URL}/moments/${id}` };
          } catch (error) {
            if (
              error instanceof Error &&
              (error.message === 'INVALID_KIND' || error.message === 'INVALID_PAYLOAD')
            ) {
              return Response.json({ error: 'Invalid input' }, { status: 400 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
