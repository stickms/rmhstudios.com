import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listUpdatesApi, postUpdateApi } from '@/lib/events/updates.contract';
import { postUpdateBody } from '@/lib/events/updates-schema';
import { listUpdates, postUpdate, refused } from '@/lib/events/updates.server';

/**
 * GET  /api/events/$id/updates — the updates, newest first, to anyone who can see the event.
 * POST /api/events/$id/updates — the host, a co-host or an admin posts one.
 */
export const route = apiRoute('/api/events/$id/updates', {
  GET: implement(listUpdatesApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, userId, isAdmin }) => {
    const updates = await listUpdates(params.id, userId, isAdmin);
    return updates ? { updates } : Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }),

  POST: implement(
    postUpdateApi,
    { rateLimit: 'write', body: postUpdateBody },
    async ({ params, userId, isAdmin, body }) => {
      try {
        const update = await postUpdate(params.id, userId, isAdmin, {
          body: body.body,
          occurrenceAt: body.occurrenceAt === undefined ? undefined : body.occurrenceAt === null ? null : new Date(body.occurrenceAt),
        });
        return { update };
      } catch (error) {
        return refused(error);
      }
    },
  ),
});
