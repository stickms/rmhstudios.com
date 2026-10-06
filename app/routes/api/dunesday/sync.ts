import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { syncBodySchema } from '@/lib/dunesday/sync-schema';
import { createPlan } from '@/lib/dunesday/sync.server';

/**
 * POST /api/dunesday/sync — turn on cloud sync for a marathon plan.
 *
 * Anonymous on purpose (the planner works signed out); returns the public
 * `feedId` and the secret edit token, which only ever exists in this response
 * and the browser that asked for it. `'write'` rate limit, per IP.
 */
export const Route = createFileRoute('/api/dunesday/sync')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'none', rateLimit: 'write', body: syncBodySchema },
        async ({ body }) => {
          const { feedId, token } = await createPlan(body.state, body.timeZone);
          return Response.json({ feedId, token }, { status: 201 });
        },
      ),
    },
  },
});
