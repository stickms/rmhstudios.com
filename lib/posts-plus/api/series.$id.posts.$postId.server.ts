import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { moveSeriesPostApi, removeSeriesPostApi } from '@/lib/posts-plus/series.contract';
import { seriesReorderBody } from '@/lib/posts-plus/schema';
import { movePost, removePost } from '@/lib/posts-plus/series.server';

/**
 * PATCH  /api/series/$id/posts/$postId { direction: 'up' | 'down' } - reorder a part (X5).
 * DELETE /api/series/$id/posts/$postId - take a post out of the series (the post stays).
 */
export const route = apiRoute('/api/series/$id/posts/$postId', {
  PATCH: implement(
    moveSeriesPostApi,
    { rateLimit: 'write', body: seriesReorderBody },
    async ({ userId, params, body }) => {
      const res = await movePost(userId, params.id, params.postId, body.direction);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ ok: true });
    },
  ),
  DELETE: implement(removeSeriesPostApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const res = await removePost(userId, params.id, params.postId);
    if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
    return Response.json({ ok: true });
  }),
});
