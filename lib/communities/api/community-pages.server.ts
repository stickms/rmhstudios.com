import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { pageErrorResponse, resolveWikiCommunity } from '@/lib/communities/page-access.server';
import { communityPageCreateSchema, communityPageListQuerySchema } from '@/lib/communities/pages-schema';
import {
  createCommunityPage,
  getCommunityPage,
  listCommunityPages,
  CommunityPageError,
} from '@/lib/communities/pages.server';
import { createCommunityPageApi, listCommunityPagesApi } from '@/lib/communities/pages.contract';

/**
 * GET  /api/community-pages?communitySlug=…[&slug=…] — index, or one page.
 * POST /api/community-pages — create (moderators only; see pages.server.ts).
 *
 * Every path asks `pageAccess` (page-access.server.ts): a private community's pages are a 404 for anyone who is not a
 * member, and a member banned from the community reads like a non-member.
 */
export const route = apiRoute('/api/community-pages', {
  GET: implement(
    listCommunityPagesApi,
    { auth: 'optional', rateLimit: 'read', query: communityPageListQuerySchema },
    async ({ query, userId, isAdmin }) => {
      const by = query.communityId
        ? { id: query.communityId }
        : query.communitySlug
          ? { slug: query.communitySlug }
          : null;
      const resolved = by ? await resolveWikiCommunity(by, userId, isAdmin) : null;
      if (!resolved) return Response.json({ error: 'Not found' }, { status: 404 });

      if (query.slug) {
        const page = await getCommunityPage(resolved.access, query.slug, userId, isAdmin);
        if (!page) return Response.json({ error: 'Not found' }, { status: 404 });
        return page;
      }
      return { pages: await listCommunityPages(resolved.access) };
    },
  ),
  POST: implement(
    createCommunityPageApi,
    {
      rateLimit: { limit: 20, windowMs: 3_600_000, prefix: 'community-page', scope: 'user' },
      body: communityPageCreateSchema,
    },
    async ({ userId, isAdmin, body }) => {
      try {
        const { communityId, ...input } = body;
        return Response.json(await createCommunityPage(userId, communityId, input, isAdmin), { status: 201 });
      } catch (error) {
        if (error instanceof CommunityPageError) return pageErrorResponse(error);
        throw error;
      }
    },
  ),
});
