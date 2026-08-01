import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCreatorAnalytics } from '@/lib/analytics.server';

/** GET /api/profile/analytics — the signed-in creator's own reach/engagement. */
export const Route = createFileRoute('/api/profile/analytics')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'creator-analytics' } },
        async ({ session }) => {
          const analytics = await getCreatorAnalytics(session.user.id);
          return Response.json(analytics);
        },
      ),
    },
  },
});
