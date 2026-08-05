import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { communityPageUpdateSchema } from '@/lib/communities/pages-schema';
import {
  updateCommunityPage,
  deleteCommunityPage,
  CommunityPageError,
} from '@/lib/communities/pages.server';

const STATUS_BY_CODE = {
  INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

/**
 * PATCH  /api/community-pages/:id — edit (subject to the page's `editPolicy`).
 * DELETE /api/community-pages/:id — moderators only.
 */
export const Route = createFileRoute('/api/community-pages/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        {
          rateLimit: { limit: 40, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' },
          body: communityPageUpdateSchema,
        },
        async ({ params, userId, isAdmin, body }) => {
          try {
            return Response.json(await updateCommunityPage(userId, params.id, body, isAdmin));
          } catch (error) {
            if (error instanceof CommunityPageError) {
              return Response.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
            }
            throw error;
          }
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId, isAdmin }) => {
        try {
          await deleteCommunityPage(userId, params.id, isAdmin);
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof CommunityPageError) {
            return Response.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
          }
          throw error;
        }
      }),
    },
  },
});
