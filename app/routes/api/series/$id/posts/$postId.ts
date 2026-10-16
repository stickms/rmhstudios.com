import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { movePost, removePost } from '@/lib/posts-plus/series.server';

/**
 * PATCH  /api/series/$id/posts/$postId { direction: 'up' | 'down' } - reorder a part (X5).
 * DELETE /api/series/$id/posts/$postId - take a post out of the series (the post stays).
 */
export const Route = createFileRoute('/api/series/$id/posts/$postId')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: z.object({ direction: z.enum(['up', 'down']) }) },
        async ({ userId, params, body }) => {
          const res = await movePost(userId, params.id, params.postId, body.direction);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await removePost(userId, params.id, params.postId);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
