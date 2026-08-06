/**
 * One Slice It chart: read, autosave, delete.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §11.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import type { Difficulty } from '@/lib/slice-it/constants';
import { ChartPatchZ } from '@/lib/slice-it/editor/api-schemas';
import { lintWireChart } from '@/lib/slice-it/editor/lint';
import { chartHashOf } from '@/lib/slice-it/editor/hash.server';
import { toChartDto } from '@/lib/slice-it/editor/seed.server';

export const Route = createFileRoute('/api/slice-it/charts/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const chart = await prisma.chart.findUnique({ where: { id: params.id } });
        if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
        // A draft is the author's private working copy — §1.1 `status`.
        if (chart.status === 'draft' && chart.authorId !== userId) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        return Response.json(toChartDto(chart, { includeNotes: true }));
      }),

      PATCH: defineHandler(
        {
          body: ChartPatchZ,
          // Autosave fires every 20s per open editor; a session is ~90 writes an
          // hour. Scoped to the user, not the IP — two people editing on one
          // campus connection must not share a bucket, which is the mistake
          // `/api/slice-it/score` documents having fixed.
          rateLimit: { limit: 120, windowMs: 60_000, prefix: 'slice-chart-patch', scope: 'user' },
        },
        async ({ userId, params, body }) => {
          const chart = await prisma.chart.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              authorId: true,
              status: true,
              songId: true,
              difficulty: true,
              song: { select: { duration: true, bpm: true } },
            },
          });
          if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
          if (chart.authorId !== userId) {
            return Response.json({ error: 'Not yours' }, { status: 403 });
          }

          // The server re-derives the hash. A client-supplied one would let an
          // edited chart claim an unedited chart's identity, which is exactly
          // what C12 exists to make impossible.
          const chartHash = chartHashOf(body.notes);

          // §9: errors block, warnings do not — and a DRAFT is exempt entirely,
          // because a draft is a work in progress by definition and an autosave
          // that refuses to save half-finished work is an autosave that loses
          // it. Once a chart is visible to other players it has to stay
          // playable, so the same rules the editor showed the author are
          // re-checked here rather than trusted from the client: the client is
          // where a caller who never opened the editor sends their `PATCH`.
          if (chart.status !== 'draft') {
            const findings = lintWireChart({
              difficulty: chart.difficulty as Difficulty,
              notes: body.notes,
              duration: chart.song.duration,
              timingPoints: body.timingPoints,
              bpm: chart.song.bpm,
            });
            const blocking = findings.filter((finding) => finding.severity === 'error');
            if (blocking.length > 0) {
              return Response.json(
                {
                  error: 'Chart has errors that must be fixed before saving a published chart',
                  issues: blocking.slice(0, 50),
                  issueCount: blocking.length,
                },
                { status: 422 },
              );
            }
          }

          const updated = await prisma.$transaction(async (tx) => {
            const row = await tx.chart.update({
              where: { id: chart.id },
              data: {
                notes: body.notes,
                ...(body.timingPoints ? { timingPoints: body.timingPoints } : {}),
                ...(body.svPoints ? { svPoints: body.svPoints } : {}),
                ...(body.name ? { name: body.name } : {}),
                chartHash,
                isGenerated: false,
              },
              // Explicit select: `notes` is the chart, and returning it on every
              // autosave doubles the round trip's payload for nothing.
              select: {
                id: true,
                songId: true,
                authorId: true,
                difficulty: true,
                keys: true,
                name: true,
                status: true,
                rating: true,
                isGenerated: true,
                generatorVersion: true,
                chartHash: true,
                updatedAt: true,
              },
            });

            await tx.chartRevision.create({
              data: { chartId: chart.id, notes: body.notes, kind: body.kind ?? 'autosave' },
            });

            return row;
          });

          return Response.json(toChartDto(updated));
        },
      ),

      DELETE: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'slice-chart-del', scope: 'user' } },
        async ({ userId, params }) => {
          const chart = await prisma.chart.findUnique({
            where: { id: params.id },
            select: { id: true, authorId: true, status: true },
          });
          if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
          if (chart.authorId !== userId) {
            return Response.json({ error: 'Not yours' }, { status: 403 });
          }
          // A published chart has a leaderboard hanging off its hash; taking it
          // away is a moderation action, not an editing one.
          if (chart.status !== 'draft') {
            return Response.json({ error: 'Published charts cannot be deleted' }, { status: 409 });
          }
          await prisma.chart.delete({ where: { id: chart.id } });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
