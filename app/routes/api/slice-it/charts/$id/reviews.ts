import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { chartReviews, hasClearedChart } from '@/lib/slice-it/library.server';

/**
 * L3 — reviews of a chart.
 *
 * Two axes rather than one star rating, because "this chart is bad" and "this
 * song is bad" are different complaints with different remedies: `fit` asks
 * whether the notes represent the music, `fun` asks whether playing them is any
 * good. A single number collapses those into something nobody can act on.
 *
 * `SongRating` is NOT revived here — the schema marks it dead with a standing
 * "do not add writers" instruction, and this is a different model anyway.
 */
const BodyZ = z.object({
  fit: z.number().int().min(1).max(5),
  fun: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});

export const Route = createFileRoute('/api/slice-it/charts/$id/reviews')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        return Response.json(await chartReviews(params.id, userId));
      }),

      PUT: defineHandler({ rateLimit: 'write', body: BodyZ }, async ({ params, userId, body }) => {
        const chart = await prisma.chart.findUnique({
          where: { id: params.id },
          select: { id: true, status: true, rankStatus: true, authorId: true },
        });
        if (!chart) return Response.json({ error: 'Chart not found' }, { status: 404 });
        // A draft is visible only to its author, so reviewing one is either
        // impossible or self-review. Neither should produce a row.
        if (chart.status === 'draft') {
          return Response.json({ error: 'That chart is not published.' }, { status: 403 });
        }
        if (chart.authorId === userId) {
          return Response.json({ error: 'You cannot review your own chart.' }, { status: 403 });
        }

        if (!(await hasClearedChart(params.id, userId))) {
          return Response.json(
            { error: 'Clear the chart before reviewing it.' },
            { status: 403 },
          );
        }

        // Upsert, not create: one review per player per chart, and editing
        // replaces it. A history of somebody's changing opinion is not what an
        // aggregate over five reviews needs.
        await prisma.chartReview.upsert({
          where: { chartId_userId: { chartId: params.id, userId } },
          create: {
            chartId: params.id,
            userId,
            fit: body.fit,
            fun: body.fun,
            body: body.body || null,
          },
          update: { fit: body.fit, fun: body.fun, body: body.body || null },
          select: { chartId: true },
        });

        return Response.json(await chartReviews(params.id, userId));
      }),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
        await prisma.chartReview
          .delete({ where: { chartId_userId: { chartId: params.id, userId } } })
          // A delete of a review that is not there is the state the caller
          // asked for, not an error.
          .catch(() => undefined);
        return Response.json(await chartReviews(params.id, userId));
      }),
    },
  },
});
