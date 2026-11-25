/**
 * One revision of a chart with its notes, for the editor's Preview and Restore.
 *
 * The list (`slice-it.charts.$id.revisions.server.ts`) never selects `notes`; a member opens one revision at a time
 * through here. Reading never writes: restoring is an edit made in the editor and saved through the chart's PATCH,
 * so a published chart's lint still applies.
 *
 * Answers as the list does: an unknown chart is 404, another member's chart is 403, and a revision that is not this
 * chart's (or was pruned between the list and the click) is 404 with `CHART_REVISION_GONE`.
 */

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { getChartRevisionApi } from '@features/slice-it/engine/charts.contract';
import type { ChartRevisionDetailDto } from '@features/slice-it/engine/editor/api-schemas';

/** A revision id is a bigint in decimal; anything else cannot be one of ours. */
const REVISION_ID = /^[0-9]{1,18}$/;

export const route = apiRoute('/api/slice-it/charts/$id/revisions/$revisionId', {
  GET: implement(getChartRevisionApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const chart = await prisma.chart.findUnique({
      where: { id: params.id },
      select: { id: true, authorId: true },
    });
    if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
    if (chart.authorId !== userId) {
      return Response.json({ error: 'Not yours' }, { status: 403 });
    }

    const gone = () =>
      Response.json(refusalBody('CHART_REVISION_GONE'), { status: ERROR_CODES.CHART_REVISION_GONE.http });
    if (!REVISION_ID.test(params.revisionId)) return gone();

    // `chartId` in the where: a revision of another chart under this chart's path is not found.
    const revision = await prisma.chartRevision.findFirst({
      where: { id: BigInt(params.revisionId), chartId: chart.id },
      select: { id: true, kind: true, label: true, createdAt: true, notes: true },
    });
    if (!revision) return gone();

    const out: ChartRevisionDetailDto = {
      id: revision.id.toString(),
      kind: revision.kind,
      label: revision.label,
      createdAt: revision.createdAt.toISOString(),
      notes: Array.isArray(revision.notes) ? (revision.notes as unknown as ChartRevisionDetailDto['notes']) : [],
    };
    return Response.json(out);
  }),
});
