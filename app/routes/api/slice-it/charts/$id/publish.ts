/**
 * Publish / unpublish one Slice It chart.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §9 and §16 phase 7 — "lint panel,
 * publish gating, `status` transitions".
 *
 * The gate is the whole point of the endpoint: **errors block, warnings do
 * not**, and the check runs here rather than being trusted from the editor. The
 * editor's panel is an affordance; this is the rule. A chart that reaches
 * `public` with an unhittable note has a leaderboard hanging off a chart nobody
 * can full-combo, and no later fix un-publishes those scores.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import type { Difficulty } from '@/lib/slice-it/constants';
import { lintWireChart } from '@/lib/slice-it/editor/lint';
import type { LintNote } from '@/lib/slice-it/beatmap/lint';
import type { TimingPoint } from '@/lib/slice-it/editor/types';
import { toChartDto } from '@/lib/slice-it/editor/seed.server';

const PublishZ = z.object({
  /** 'public' publishes; 'draft' pulls it back to the author's private copy. */
  status: z.enum(['public', 'draft']),
});

export const Route = createFileRoute('/api/slice-it/charts/$id/publish')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: PublishZ,
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'slice-chart-publish', scope: 'user' },
        },
        async ({ userId, params, body }) => {
          const chart = await prisma.chart.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              authorId: true,
              status: true,
              rankStatus: true,
              difficulty: true,
              notes: true,
              timingPoints: true,
              song: { select: { duration: true, bpm: true } },
            },
          });
          if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
          if (chart.authorId !== userId) {
            return Response.json({ error: 'Not yours' }, { status: 403 });
          }

          if (body.status === 'draft') {
            // Un-publishing a chart in the ranked pool would strip a chart other
            // players' ratings are computed from. That is a moderation action
            // (`R10`), not an editing one.
            if (chart.rankStatus !== 'unranked') {
              return Response.json(
                { error: 'A qualified or ranked chart cannot be returned to draft' },
                { status: 409 },
              );
            }
          } else {
            const notes = (chart.notes ?? []) as LintNote[];
            if (notes.length === 0) {
              return Response.json({ error: 'An empty chart cannot be published' }, { status: 422 });
            }
            const findings = lintWireChart({
              difficulty: chart.difficulty as Difficulty,
              notes,
              duration: chart.song.duration,
              timingPoints: (chart.timingPoints ?? null) as TimingPoint[] | null,
              bpm: chart.song.bpm,
            });
            const blocking = findings.filter((finding) => finding.severity === 'error');
            if (blocking.length > 0) {
              return Response.json(
                {
                  error: 'Fix the errors before publishing',
                  // Capped: a chart pasted together by a script can produce
                  // thousands of these, and an error body is not a lint report.
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
              data: { status: body.status },
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
            // A publish is a point an author will want to come back to, which is
            // exactly what the `publish` revision kind is for.
            if (body.status === 'public' && chart.status !== 'public') {
              await tx.chartRevision.create({
                data: { chartId: chart.id, notes: chart.notes ?? [], kind: 'publish' },
              });
            }
            return row;
          });

          return Response.json(toChartDto(updated));
        },
      ),
    },
  },
});
