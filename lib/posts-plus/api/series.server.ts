import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createSeriesApi, listSeriesApi } from '@/lib/posts-plus/series.contract';
import { createSeries, listFollowed, listMine } from '@/lib/posts-plus/series.server';
import { seriesCreateSchema } from '@/lib/posts-plus/schema';

/**
 * GET  /api/series - the caller's series and the series they follow (X5).
 * POST /api/series { title, description? } - start a series.
 */
export const route = apiRoute('/api/series', {
  GET: implement(listSeriesApi, { rateLimit: 'read' }, async ({ userId }) => {
    const [mine, following] = await Promise.all([listMine(userId), listFollowed(userId)]);
    return Response.json(
      { mine, following },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }),
  POST: implement(
    createSeriesApi,
    { rateLimit: 'write', body: seriesCreateSchema },
    async ({ userId, body }) => {
      const res = await createSeries(userId, body);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ id: res.id, title: body.title }, { status: 201 });
    },
  ),
});
