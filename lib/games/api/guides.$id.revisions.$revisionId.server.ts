import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getGuideRevisionApi } from '@/lib/games/guide-history.contract';
import { getGuideRevision } from '@/lib/games/guide-history.server';

/**
 * GET /api/guides/:id/revisions/:revisionId — one earlier version's text. The author and admins only; a revision
 * of another guide is a 404.
 */
export const route = apiRoute('/api/guides/$id/revisions/$revisionId', {
  GET: implement(getGuideRevisionApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, session, isAdmin }) => {
    const rev = await getGuideRevision({ userId: session?.user.id ?? null, isAdmin }, params.id, params.revisionId);
    if (!rev) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(rev);
  }),
});
