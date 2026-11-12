import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { listPendingRequests } from '@/lib/communities/join-requests.server';

/** GET /api/communities/$slug/join-requests — pending requests (owner and moderators). */
export const route = apiRoute('/api/communities/$slug/join-requests', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    return Response.json({ requests: await listPendingRequests(guard.value.id) });
  }),
});
