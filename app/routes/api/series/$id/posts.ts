import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { addPost } from '@/lib/posts-plus/series.server';
import { seriesAddPostSchema } from '@/lib/posts-plus/schema';

/** POST /api/series/$id/posts { postId } - append one of your own public posts as the next part (X5). */
export const Route = createFileRoute('/api/series/$id/posts')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: seriesAddPostSchema },
        async ({ userId, params, body }) => {
          const res = await addPost(userId, params.id, body.postId);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true }, { status: 201 });
        },
      ),
    },
  },
});
