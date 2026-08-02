import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getWeeklyRecap } from '@/lib/recap.server';

/** GET /api/recap — the signed-in user's "week on RMH" recap. */
export const Route = createFileRoute('/api/recap')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'recap' } },
        async ({ session }) => {
          const recap = await getWeeklyRecap(session.user.id);
          return Response.json(recap);
        },
      ),
    },
  },
});
