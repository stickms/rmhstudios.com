import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { chartPath } from '@/lib/api/v1/slice-it-schema';
import { SLICE_CACHE, getChartDetail, readInput } from '@/lib/api/v1/slice-it.server';

/**
 * GET /api/v1/slice-it/charts/{id} — one public song's details: the list's fields, its published charts (id,
 * difficulty, note count, revision) and the count and averages of its chart reviews. A private, taken-down or
 * missing song is the same `404`. The chart's notes are never returned.
 */
export const Route = createFileRoute('/api/v1/slice-it/charts/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const p = readInput(params, chartPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const detail = await getChartDetail(p.data.id);
            if (!detail) return error('not_found', 'No such public song.', 404);
            return json({ data: detail }, 200, SLICE_CACHE);
          },
          { scope: 'read:slice-it' },
        ),
    },
  },
});
