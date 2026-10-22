import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { navForPost } from '@/lib/posts-plus/series.server';

/**
 * GET /api/series/post/$postId - the "Part k of N - Series name" payload for one
 * post, with prev/next (X5). Loaded lazily by the card chip, only for posts whose
 * feed item carries a `seriesId`. 404 when the post is not in a live series.
 */
export const Route = createFileRoute('/api/series/post/$postId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const nav = await navForPost(params.postId, userId);
        if (!nav) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(nav, { headers: { 'Cache-Control': 'private, max-age=30' } });
      }),
    },
  },
});
