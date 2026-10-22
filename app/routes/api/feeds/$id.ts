import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { customFeedSchema, feedViewQuery } from '@/lib/discovery/schema';
import { deleteFeed, getFeedView, updateFeed } from '@/lib/discovery/feeds.server';

/**
 * GET    /api/feeds/$id?cursor= — the feed's posts, keyset-paginated (A4).
 * PATCH  /api/feeds/$id — owner edits the definition.
 * DELETE /api/feeds/$id — owner deletes it.
 */
export const Route = createFileRoute('/api/feeds/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: feedViewQuery },
        async ({ userId, params, query }) => {
          const view = await getFeedView(params.id, userId, query.cursor);
          if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(view, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      PATCH: defineHandler(
        { rateLimit: 'write', body: customFeedSchema },
        async ({ userId, params, body }) => {
          const res = await updateFeed(userId, params.id, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await deleteFeed(userId, params.id);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
