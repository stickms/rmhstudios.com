import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { listQuotes } from '@/lib/feed/quotes.server';
import { postQuotesApi } from '@/lib/feed/rmhark-actions.contract';

/**
 * GET /api/rmharks/$id/quotes — every quote-post of a post, newest first,
 * keyset-paginated (`?cursor=`), each with its own quotes nested one level (X10).
 */
export const route = apiRoute('/api/rmharks/$id/quotes', {
  GET: implement(
    postQuotesApi,
    {
      auth: 'optional',
      rateLimit: 'read',
      query: z.object({ cursor: z.string().max(200).optional() }),
    },
    async ({ userId, params, query }) => {
      const page = await listQuotes(params.id, userId, query.cursor ?? null);
      if (!page) return Response.json({ error: 'Post not found' }, { status: 404 });
      return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
});
