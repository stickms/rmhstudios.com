import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCommunityBySlug, getRole } from '@/lib/communities/access.server';
import { prisma } from '@/lib/prisma.server';
import {
  communityPageCreateSchema,
  communityPageListQuerySchema,
} from '@/lib/communities/pages-schema';
import {
  createCommunityPage,
  getCommunityPage,
  listCommunityPages,
  CommunityPageError,
} from '@/lib/communities/pages.server';

const STATUS_BY_CODE = {
  INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

/**
 * GET  /api/community-pages?communitySlug=…[&slug=…] — index, or one page.
 * POST /api/community-pages — create (moderators only; see pages.server.ts).
 */
export const Route = createFileRoute('/api/community-pages/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: communityPageListQuerySchema },
        async ({ query, userId, isAdmin }) => {
          let communityId = query.communityId ?? null;
          let isPrivate = false;
          if (!communityId && query.communitySlug) {
            const community = await getCommunityBySlug(query.communitySlug);
            communityId = community?.id ?? null;
            isPrivate = community?.isPrivate ?? false;
          } else if (communityId) {
            const community = await prisma.community.findUnique({
              where: { id: communityId },
              select: { isPrivate: true },
            });
            if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
            isPrivate = community.isPrivate;
          }
          if (!communityId) return Response.json({ error: 'Not found' }, { status: 404 });
          // Members-only: a private community's pages are invisible to
          // non-members (404, as for a missing community).
          if (isPrivate && !(await getRole(communityId, userId))) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          if (query.slug) {
            const page = await getCommunityPage(communityId, query.slug, userId, isAdmin);
            if (!page) return Response.json({ error: 'Not found' }, { status: 404 });
            return Response.json(page);
          }
          return Response.json({ pages: await listCommunityPages(communityId) });
        },
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' },
          body: communityPageCreateSchema,
        },
        async ({ userId, isAdmin, body }) => {
          try {
            const { communityId, ...input } = body;
            return Response.json(
              await createCommunityPage(userId, communityId, input, isAdmin),
              { status: 201 },
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
