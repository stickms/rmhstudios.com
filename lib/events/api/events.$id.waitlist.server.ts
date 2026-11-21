import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { EventError } from '@/lib/events.server';
import { listWaitlist, removeFromWaitlist } from '@/lib/events/waitlist.server';
import { listWaitlistApi, removeFromWaitlistApi } from '@/lib/events/waitlist.contract';

const removeQuery = z.object({ userId: z.string().min(1).max(64) });

function notFound(error: unknown): Response {
  if (error instanceof EventError) return Response.json({ error: 'Not found' }, { status: 404 });
  throw error;
}

/**
 * GET    /api/events/$id/waitlist            — the waitlist in order (host or site admin).
 * DELETE /api/events/$id/waitlist?userId=…   — take one member off it (host or site admin).
 */
export const route = apiRoute('/api/events/$id/waitlist', {
  GET: implement(listWaitlistApi, { rateLimit: 'read' }, async ({ params, userId, isAdmin }) => {
    try {
      return await listWaitlist(params.id, userId, isAdmin);
    } catch (error) {
      return notFound(error);
    }
  }),

  DELETE: implement(
    removeFromWaitlistApi,
    { rateLimit: 'write', query: removeQuery },
    async ({ params, userId, isAdmin, query }) => {
      try {
        return await removeFromWaitlist(params.id, userId, isAdmin, query.userId);
      } catch (error) {
        return notFound(error);
      }
    },
  ),
});
