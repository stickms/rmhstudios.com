/**
 * POST /api/slice-it/ai/metadata — tidy an upload's fields. (Features 8 and 9.)
 *
 * Returns `{ suggestion }`, null when AI is unavailable — the upload form's
 * fields already exist and already work.
 *
 * **Nothing here is written.** The response is rendered into the form as
 * pre-filled text the uploader edits and submits through the ordinary upload
 * route, which validates it as it always did. That is what keeps a wrong guess
 * at an artist name a keystroke to fix rather than a false credit published on
 * a public library card.
 *
 * The chart statistics come from the body because the client generated them —
 * this runs *before* the upload exists, so there is no row to read them from.
 * They are three bounded numbers feeding a blurb, which is about as low-stakes
 * as client-supplied input gets.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { MetadataRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { suggestMetadata } from '@/lib/slice-it/ai/upload.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import type { ChartFacts } from '@/lib/slice-it/ai/facts';

export const Route = createFileRoute('/api/slice-it/ai/metadata')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: MetadataRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 10,
            windowMs: 60_000,
            prefix: 'slice-metadata',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) return Response.json({ suggestion: null });
          await assertAiBudget(userId);

          // Only the three statistics the blurb reads are carried over; the rest
          // of `ChartFacts` is zeroed rather than faked, and `chartFactsToText`
          // simply reports zeros for what the client did not send.
          const facts: ChartFacts | null = body.chart
            ? {
                noteCount: body.chart.noteCount,
                durationSec: body.durationSec,
                averageNps: body.chart.averageNps,
                peakNps: body.chart.peakNps,
                peakAtSec: 0,
                minGapMs: 0,
                types: {
                  STANDARD: 0,
                  MOVING: 0,
                  LONG: 0,
                  SILENT: 0,
                  SPEED: 0,
                  BOMB: 0,
                  SWITCH: 0,
                },
                laneBalance: 0.5,
                jackRatio: 0,
                longestStream: 0,
                sections: [],
              }
            : null;

          const suggestion = await suggestMetadata(
            {
              filename: body.filename,
              typed: body.typed,
              facts,
              durationSec: body.durationSec,
            },
            { userId },
          );

          return Response.json({ suggestion });
        },
      ),
    },
  },
});
