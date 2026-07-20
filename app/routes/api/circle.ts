import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getCircleData, setCircle, MAX_CIRCLE, CircleError } from '@/lib/circle.server';

const putSchema = z.object({ userIds: z.array(z.string().min(1).max(64)).max(MAX_CIRCLE) });

/**
 * GET /api/circle — the owner's circle members + candidate accounts.
 * PUT /api/circle { userIds } — replace the circle (full set).
 * Membership changes never notify anyone (§11).
 */
export const Route = createFileRoute('/api/circle')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json(await getCircleData(session.user.id));
        } catch (error) {
          console.error('Circle fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'circle',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = putSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          try {
            await setCircle(session.user.id, parsed.data.userIds);
          } catch (e) {
            if (e instanceof CircleError) return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
          return Response.json({ ok: true, count: parsed.data.userIds.length });
        } catch (error) {
          console.error('Circle save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
