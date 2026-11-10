import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { followSeriesApi, unfollowSeriesApi } from '@/lib/posts-plus/series.contract';
import { setFollow } from '@/lib/posts-plus/series.server';

/**
 * PUT    /api/series/$id/follow - follow a series; new parts notify you (X5).
 * DELETE /api/series/$id/follow - stop following.
 */
export const Route = createFileRoute('/api/series/$id/follow')({
  server: {
    handlers: {
      PUT: implement(followSeriesApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await setFollow(userId, params.id, true);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ following: true });
      }),
      DELETE: implement(unfollowSeriesApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await setFollow(userId, params.id, false);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ following: false });
      }),
    },
  },
});
