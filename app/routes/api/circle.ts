import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
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
      GET: defineHandler({}, async ({ session }) => {
        return Response.json(await getCircleData(session.user.id));
      }),

      PUT: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'circle' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = putSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          try {
            await setCircle(session.user.id, parsed.data.userIds);
          } catch (e) {
            if (e instanceof CircleError)
              return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
          return Response.json({ ok: true, count: parsed.data.userIds.length });
        },
      ),
    },
  },
});
