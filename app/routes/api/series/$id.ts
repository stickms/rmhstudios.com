import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { deleteSeriesApi, getSeriesApi, updateSeriesApi } from '@/lib/posts-plus/series.contract';
import { deleteSeries, getSeriesView, updateSeries } from '@/lib/posts-plus/series.server';
import { seriesUpdateSchema } from '@/lib/posts-plus/schema';

/**
 * GET    /api/series/$id - the series page payload: header + its live parts, in order (X5).
 * PATCH  /api/series/$id { title?, description? } - owner only.
 * DELETE /api/series/$id - owner only; the posts stay, only the grouping goes.
 */
export const Route = createFileRoute('/api/series/$id')({
  server: {
    handlers: {
      GET: implement(
        getSeriesApi,
        { auth: 'optional', rateLimit: 'read' },
        async ({ userId, params }) => {
          const view = await getSeriesView(params.id, userId);
          if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(view, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      PATCH: implement(
        updateSeriesApi,
        { rateLimit: 'write', body: seriesUpdateSchema },
        async ({ userId, params, body }) => {
          const res = await updateSeries(userId, params.id, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
      DELETE: implement(deleteSeriesApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await deleteSeries(userId, params.id);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
