import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { leaveGroup } from '@/lib/group-chat/manage.server';

/**
 * POST /api/group-chats/$id/leave — leave a group. If the owner leaves, ownership passes to the longest-standing
 * remaining member; last one out disbands it.
 */
export const route = apiRoute('/api/group-chats/$id/leave', {
  POST: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:group-chats/:id/leave' } },
    async ({ params, session }) => {
      const result = await leaveGroup(session.user.id, params.id);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ success: true });
    },
  ),
});
