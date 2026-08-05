import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { communityPageRollbackSchema } from '@/lib/communities/pages-schema';
import {
  listRevisions,
  rollbackCommunityPage,
  CommunityPageError,
} from '@/lib/communities/pages.server';

const STATUS_BY_CODE = {
  INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

/**
 * GET  /api/community-pages/:id/revisions — the page's history.
 * POST /api/community-pages/:id/revisions — roll back to one of them.
 *
 * Rollback is a POST to the history collection rather than a PUT on the page
 * because it *appends*: restoring an old body snapshots the current one first,
 * so the vandalised version stays in the record and the revert is itself
 * revertible.
 */
export const Route = createFileRoute('/api/community-pages/$id/revisions')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params }) =>
        Response.json({ revisions: await listRevisions(params.id) }),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' },
          body: communityPageRollbackSchema,
        },
        async ({ params, userId, isAdmin, body }) => {
          try {
            return Response.json(
              await rollbackCommunityPage(userId, params.id, body.revisionId, isAdmin),
            );
          } catch (error) {
            if (error instanceof CommunityPageError) {
              return Response.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
            }
            throw error;
          }
        },
      ),
    },
  },
});
