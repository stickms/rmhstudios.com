import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { SITE_URL } from '@/lib/seo';
import { createMoment } from '@/lib/moments.server';

const schema = z.object({
  kind: z.string().min(1).max(24),
  payload: z
    .object({
      value: z.string().min(1).max(60),
      title: z.string().max(80).optional(),
      subtitle: z.string().max(120).optional(),
    })
    .passthrough(),
});

/**
 * POST /api/moments — create a shared moment (Shareable stat cards, §13).
 * Only ever called when the user chooses to share. Returns the moment id and its
 * public landing URL (which unfurls via /api/og/moment/$id).
 */
export const Route = createFileRoute('/api/moments/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'moments-create',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const { id } = await createMoment({
            userId: session.user.id,
            kind: parsed.data.kind,
            payload: parsed.data.payload,
          });

          return Response.json({ id, url: `${SITE_URL}/moments/${id}` });
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message === 'INVALID_KIND' || error.message === 'INVALID_PAYLOAD')
          ) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          console.error('Create moment error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
