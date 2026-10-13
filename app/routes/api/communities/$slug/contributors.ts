import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireReadable } from '@/lib/communities/guard.server';
import { getTopContributors } from '@/lib/communities/contributors.server';

/** GET /api/communities/$slug/contributors — the helpfulness leaderboard (daily snapshot). */
export const Route = createFileRoute('/api/communities/$slug/contributors')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireReadable(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ contributors: await getTopContributors(guard.value.id) });
      }),
    },
  },
});
