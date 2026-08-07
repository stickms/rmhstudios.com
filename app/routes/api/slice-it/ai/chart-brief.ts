/**
 * POST /api/slice-it/ai/chart-brief — what a chart will ask of you. (Feature 4.)
 *
 * Returns `{ plain, brief }`. `plain` is the computed one-line difficulty
 * readout and is always present; `brief` is the model's version and is null
 * when AI is unavailable. The panel renders `plain` either way, so it never
 * appears empty.
 *
 * ## Why this one is cached and the loadout route is not
 *
 * A brief depends only on `(songId, difficulty)` — it is the same text for
 * every player, so the first person to open a song pays for it and everyone
 * after them does not. That matters more here than elsewhere: a song page is
 * opened far more often than a run is finished, and without the cache this
 * would be the most-called AI route in the game by an order of magnitude.
 *
 * `apiCache` is per-process and the web tier runs two containers during a
 * blue/green swap, so the worst case is the brief being generated twice. That
 * is the correct trade against wiring a shared cache for a string that costs a
 * fraction of a cent.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { apiCache } from '@/lib/cache';
import { ChartBriefRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { briefChart, describeChartPlainly } from '@/lib/slice-it/ai/chart.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import { loadSongFacts } from '@/lib/slice-it/ai/song-facts.server';
import type { ChartBrief } from '@/lib/slice-it/ai/types';

/** A chart does not change, so this is bounded by deploy lifetime, not freshness. */
const BRIEF_TTL_MS = 6 * 60 * 60 * 1000;

export const Route = createFileRoute('/api/slice-it/ai/chart-brief')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'optional',
          body: ChartBriefRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 20,
            windowMs: 60_000,
            prefix: 'slice-chart-brief',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          const song = await loadSongFacts(body.songId, userId, { difficulty: body.difficulty });
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
          if (!song.facts) return Response.json({ plain: null, brief: null });

          const plain = describeChartPlainly(song.facts);
          if (!isAiConfigured()) return Response.json({ plain, brief: null });

          const key = `slice-brief:${song.id}:${body.difficulty}`;
          const cached = apiCache.get<ChartBrief | null>(key);
          if (cached !== undefined) return Response.json({ plain, brief: cached });

          // Budget is asserted only on the path that will actually spend. A cache
          // hit costs nothing and must not be refused to someone out of allowance.
          await assertAiBudget(userId);

          const brief = await briefChart(
            {
              songTitle: song.title,
              songArtist: song.artist,
              difficulty: body.difficulty,
              facts: song.facts,
            },
            { userId },
          );

          // A null is cached too, briefly — an outage otherwise means every
          // visitor to a popular song retries the provider on its behalf.
          apiCache.set(key, brief, brief ? BRIEF_TTL_MS : 60_000);
          return Response.json({ plain, brief });
        },
      ),
    },
  },
});
