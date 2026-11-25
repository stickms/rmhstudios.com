/**
 * Where players miss one chart: the sampled miss heat the editor tints its timeline with.
 *
 * The chart's author only. Anyone else — another member, a signed-out caller, the author of a different chart — gets
 * the same 404 a chart that does not exist gets, so the route cannot be used to learn that a draft is there. The heat
 * is the current hash's alone (an edit starts a fresh histogram), and under five sampled runs it is empty.
 */

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { getChartMissesApi } from '@features/slice-it/engine/charts.contract';
import { chartMisses } from '@features/slice-it/engine/ops.server';

export const route = apiRoute('/api/slice-it/charts/$id/misses', {
  GET: implement(getChartMissesApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const chart = await prisma.chart.findUnique({
      where: { id: params.id },
      select: { id: true, authorId: true, chartHash: true, song: { select: { duration: true } } },
    });
    if (!chart || chart.authorId !== userId) return Response.json({ error: 'Not found' }, { status: 404 });

    return chartMisses(chart.id, chart.chartHash, chart.song.duration);
  }),
});
