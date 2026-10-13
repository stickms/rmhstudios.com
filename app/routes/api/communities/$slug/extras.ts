import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCommunityExtras } from '@/lib/communities/extras.server';

/**
 * GET /api/communities/$slug/extras — everything the community page needs that
 * the loader doesn't ship: flairs, posting status (S2), Related rail (N8),
 * pending onboarding questions (N3). One lazy request after first paint.
 */
export const Route = createFileRoute('/api/communities/$slug/extras')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const extras = await getCommunityExtras(params.slug, userId);
        if (!extras) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(extras);
      }),
    },
  },
});
