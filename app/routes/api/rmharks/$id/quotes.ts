import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { listQuotes } from '@/lib/feed/quotes.server';

/**
 * GET /api/rmharks/$id/quotes — every quote-post of a post, newest first,
 * keyset-paginated (`?cursor=`), each with its own quotes nested one level (X10).
 */
export const Route = createFileRoute('/api/rmharks/$id/quotes')({
  server: {
    handlers: {
      GET: defineHandler(
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
    },
  },
});
