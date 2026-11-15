import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { requireReadable } from '@/lib/communities/guard.server';
import { getHallOfFame } from '@/lib/communities/starboard.server';

/** GET /api/communities/$slug/starboard — the hall of fame (posts at the ⭐ threshold). */
export const route = apiRoute('/api/communities/$slug/starboard', {
  GET: defineHandler(
    { auth: 'optional', rateLimit: 'read' },
    async ({ request, params, userId }) => {
      const guard = await requireReadable(params.slug, userId);
      if (!guard.ok) return guard.response;
      const cursor = new URL(request.url).searchParams.get('cursor');
      return Response.json(await getHallOfFame(guard.value.id, userId, { cursor }));
    },
  ),
});
