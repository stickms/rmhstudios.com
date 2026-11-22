import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listGuideRevisionsApi } from '@/lib/games/guide-history.contract';
import { listGuideRevisions } from '@/lib/games/guide-history.server';

/**
 * GET /api/guides/:id/revisions — the earlier versions of a guide, newest edit first, without bodies. The author
 * and admins only; anyone else, and a signed-out caller, get the same 404 as a guide that does not exist.
 */
export const route = apiRoute('/api/guides/$id/revisions', {
  GET: implement(
    listGuideRevisionsApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ params, session, isAdmin }) => {
      const list = await listGuideRevisions({ userId: session?.user.id ?? null, isAdmin }, params.id);
      if (!list) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json(list);
    },
  ),
});
