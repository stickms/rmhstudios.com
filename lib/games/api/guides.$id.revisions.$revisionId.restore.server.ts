import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { restoreGuideRevisionApi } from '@/lib/games/guide-history.contract';
import { restoreGuideRevision } from '@/lib/games/guide-history.server';

/**
 * POST /api/guides/:id/revisions/:revisionId/restore — make an earlier version current. Author only (an admin can
 * read the history and gets 403 here). Goes through `updateGuide`, so the replaced text becomes a revision.
 */
export const route = apiRoute('/api/guides/$id/revisions/$revisionId/restore', {
  POST: implement(
    restoreGuideRevisionApi,
    { auth: 'optional', rateLimit: { limit: 30, windowMs: 60_000, prefix: 'guides' } },
    async ({ params, session, isAdmin }) => {
      const result = await restoreGuideRevision(
        { userId: session?.user.id ?? null, isAdmin },
        params.id,
        params.revisionId,
      );
      if (result === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (result === 'not_found') return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json({ ok: true });
    },
  ),
});
