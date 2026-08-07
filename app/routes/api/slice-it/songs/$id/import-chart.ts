import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { DIFFICULTIES, INPUT_COOLDOWN_MS } from '@/lib/slice-it/constants';
import { chartHashOf } from '@/lib/slice-it/editor/hash.server';
import { uuidv7 } from '@/lib/slice-it/editor/uuid';
import { ImportError, importChart } from '@/lib/slice-it/import';

/**
 * C9 — import a chart from osu!mania, StepMania or Clone Hero.
 *
 * The uploader supplies the audio (it is already their song) and this supplies
 * the notes. Two rules the route enforces rather than trusting:
 *
 *  1. **Only on your own song.** A conversion is a claim about which notes go
 *     with this audio, and that is the uploader's call.
 *  2. **`isGenerated: false` and `rankStatus: 'unranked'`.** A converted chart's
 *     note times came from someone else's timing against someone else's master
 *     of the track, so it can be perfect on the original release and 40 ms out
 *     here — invisible to everyone except the leaderboard. `isGenerated: false`
 *     also keeps `C8`'s backfill from overwriting it, which is exactly right:
 *     there is a human in this chart.
 */

/**
 * 4 MB.
 *
 * A `.sm` for a 10-minute track with six difficulties is a few hundred KB;
 * anything past this is not a chart file. Checked here as well as by the body
 * limit because the error a user can act on is "that is not a chart", not "413".
 */
const MAX_CHART_BYTES = 4 * 1024 * 1024;

const BodyZ = z.object({
  text: z.string().min(1).max(MAX_CHART_BYTES),
  difficulty: z.enum(DIFFICULTIES),
  /** Display name for the chart row. Defaults to what the source called it. */
  name: z.string().trim().max(64).optional(),
});

export const Route = createFileRoute('/api/slice-it/songs/$id/import-chart')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 15 * 60_000, prefix: 'slice-import', scope: 'user' },
          body: BodyZ,
        },
        async ({ params, userId, body }) => {
          const song = await prisma.song.findUnique({
            where: { id: params.id },
            select: { id: true, uploadedBy: true },
          });
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
          if (song.uploadedBy !== userId) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          let imported;
          try {
            // The engine's own per-lane debounce is what makes a folded chord
            // unhittable, so it is the gap the importer must dedupe against —
            // passed in rather than imported by the parser, which is browser-
            // safe and knows nothing about the engine.
            imported = importChart(body.text, INPUT_COOLDOWN_MS / 1000);
          } catch (error) {
            // `ImportError` messages are written for the uploader ("Only
            // osu!mania charts can be imported"), so they are safe to return.
            // Anything else is a bug and must not leak.
            if (error instanceof ImportError) {
              return Response.json({ error: error.message }, { status: 400 });
            }
            throw error;
          }

          const chart = await prisma.chart.create({
            data: {
              id: uuidv7(),
              songId: song.id,
              authorId: userId,
              difficulty: body.difficulty,
              keys: 2,
              name: (body.name || imported.name).slice(0, 64),
              notes: imported.notes as never,
              chartHash: chartHashOf(imported.notes),
              // Never `isGenerated: true`: that flag is what C8's backfill uses
              // to decide it may overwrite a chart, and this one has a human in
              // it. It also has no `generatorVersion`, because no generator of
              // ours made it.
              isGenerated: false,
              status: 'draft',
              rankStatus: 'unranked',
            },
            select: { id: true, difficulty: true, name: true, chartHash: true },
          });

          return Response.json({
            success: true,
            chart,
            source: imported.source,
            sourceKeys: imported.keys,
            noteCount: imported.notes.length,
            // Surfaced, not swallowed. "This import dropped 340 unhittable
            // notes" is something the uploader has to be told rather than
            // discover on the first playtest.
            warnings: imported.warnings,
          });
        },
      ),
    },
  },
});
