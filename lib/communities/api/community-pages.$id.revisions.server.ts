import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { pageAccess, pageErrorResponse } from '@/lib/communities/page-access.server';
import { communityPageRollbackSchema } from '@/lib/communities/pages-schema';
import { listRevisions, rollbackCommunityPage, CommunityPageError } from '@/lib/communities/pages.server';
import { listCommunityPageRevisionsApi, rollbackCommunityPageApi } from '@/lib/communities/pages.contract';

/**
 * GET  /api/community-pages/:id/revisions — the page's history.
 * POST /api/community-pages/:id/revisions — roll back to one of them.
 *
 * Rollback is a POST to the history collection rather than a PUT on the page
 * because it *appends*: restoring an old body snapshots the current one first,
 * so the vandalised version stays in the record and the revert is itself
 * revertible. It takes `baseUpdatedAt` like an edit does.
 */
export const route = apiRoute('/api/community-pages/$id/revisions', {
  GET: implement(listCommunityPageRevisionsApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, userId, isAdmin }) => {
    // Members-only: the history of a private community's page is invisible to
    // non-members (404, as for a missing page), as it is to a member banned from it.
    const page = await prisma.communityPage.findUnique({ where: { id: params.id }, select: { communityId: true } });
    const access = page ? await pageAccess(page.communityId, userId, isAdmin) : null;
    const revisions = access?.read ? await listRevisions(params.id, access) : null;
    if (!revisions) return Response.json({ error: 'Not found' }, { status: 404 });
    return { revisions };
  }),
  POST: implement(
    rollbackCommunityPageApi,
    {
      rateLimit: { limit: 20, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' },
      body: communityPageRollbackSchema,
    },
    async ({ params, userId, isAdmin, body }) => {
      try {
        return await rollbackCommunityPage(userId, params.id, body.revisionId, body.baseUpdatedAt, isAdmin);
      } catch (error) {
        if (error instanceof CommunityPageError) return pageErrorResponse(error);
        throw error;
      }
    },
  ),
});
