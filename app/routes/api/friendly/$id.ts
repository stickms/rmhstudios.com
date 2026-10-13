import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { actOnFriendly } from '@/lib/competitive/friendly.server';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('report'), result: z.enum(['win', 'loss']) }),
]);

/** POST /api/friendly/:id — accept / decline (opponent) or report the result (either side). No Elo. */
export const Route = createFileRoute('/api/friendly/$id')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: schema },
        async ({ params, userId, body }) => {
          const res = await actOnFriendly(params.id, userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
