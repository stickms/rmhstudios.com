/**
 * Slice It charts — list, and seed-on-demand.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §2 / §11 / §16 phase 1.
 *
 * The POST is the "seed a Chart row from `Song.analysisData` on demand" half of
 * phase 1. It is idempotent by construction (see `ensureCharts`), so the editor
 * calls it on every open rather than having to know whether this song has been
 * edited before.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { ChartListQueryZ, ChartSeedZ } from '@/lib/slice-it/editor/api-schemas';
import { ensureCharts, toChartDto } from '@/lib/slice-it/editor/seed.server';

/**
 * Who may author a chart for a song.
 *
 * `docs/slice-it-chart-editor.md` §17.1 leaves this open, and the conservative
 * reading is the one the 08-06 security pass already settled for
 * `patch-analysis`: the uploader owns the audio, so for now the uploader (and an
 * admin) is the only person who can create charts on it. Widening this to
 * alternate charts by anyone (C2) is a product call with moderation
 * consequences (L9) and is deliberately not made here.
 */
async function mayAuthor(songId: string, userId: string, isAdmin: boolean) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, uploadedBy: true, isPublic: true },
  });
  if (!song) return { song: null, allowed: false } as const;
  return { song, allowed: isAdmin || song.uploadedBy === userId } as const;
}

export const Route = createFileRoute('/api/slice-it/charts')({
  server: {
    handlers: {
      /** Every chart the caller may see for a song: their own, plus published ones. */
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: ChartListQueryZ },
        async ({ userId, query }) => {
          const rows = await prisma.chart.findMany({
            where: {
              songId: query.songId,
              OR: [
                { status: { in: ['public', 'ranked'] } },
                ...(userId ? [{ authorId: userId }] : []),
              ],
            },
            orderBy: [{ authorId: 'asc' }, { createdAt: 'asc' }],
            // No `notes`: a list of four Expert charts is ~360 KB of note arrays
            // to render four rows of metadata. The single read carries the chart.
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
          return Response.json({ charts: rows.map((row) => toChartDto(row)) });
        },
      ),

      /**
       * Seed the caller's four charts for a song from `Song.analysisData`.
       *
       * A write, but a cheap and idempotent one — rate-limited as a write anyway,
       * scoped to the user so two people opening the editor from one campus
       * connection do not share a bucket.
       */
      POST: defineHandler(
        {
          body: ChartSeedZ,
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'slice-chart-seed', scope: 'user' },
        },
        async ({ userId, isAdmin, body }) => {
          const { song, allowed } = await mayAuthor(body.songId, userId, isAdmin);
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
          if (!allowed) {
            return Response.json({ error: 'Not your song' }, { status: 403 });
          }

          const result = await ensureCharts(song.id, userId, body.keys);
          return Response.json(result);
        },
      ),
    },
  },
});
