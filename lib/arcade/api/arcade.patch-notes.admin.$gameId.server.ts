import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminListPatchNotesApi } from '@/lib/arcade/updates.contract';
import { updatesQuery } from '@/lib/arcade/updates-schema';
import { listPatchNotes } from '@/lib/arcade/updates.server';
import { games } from '@/lib/catalog';

/**
 * GET /api/arcade/patch-notes/admin/:gameId — every note of a catalogue game, for `/admin/patch-notes`. Admin only.
 * The public list 404s a title played elsewhere; an admin can publish a note for one, so they must be able to see it.
 */
export const route = apiRoute('/api/arcade/patch-notes/admin/$gameId', {
  GET: implement(
    adminListPatchNotesApi,
    { auth: 'admin', rateLimit: 'read', query: updatesQuery },
    async ({ params, query }) => {
      if (!games.some((g) => g.id === params.gameId)) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      return listPatchNotes(params.gameId, query.cursor);
    },
  ),
});
