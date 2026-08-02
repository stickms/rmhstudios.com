/**
 * GET /api/games/$id/leaderboard?limit=<1..100> — one leaderboard endpoint
 * for every scored game, with one response shape.
 *
 * Public: leaderboards are a discovery surface, and requiring a session to see
 * one hides the game from exactly the people who haven't played it yet.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getGameAdapter } from '@/lib/game/adapters.server';
import { getGameScoreRules } from '@/lib/game/registry';

export const Route = createFileRoute('/api/games/$id/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request, params }) => {
        const adapter = getGameAdapter(params.id);
        const rules = getGameScoreRules(params.id);
        if (!adapter || !rules) {
          return Response.json({ error: 'Unknown game' }, { status: 404 });
        }

        const raw = Number(new URL(request.url).searchParams.get('limit'));
        const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 10;

        const rows = await adapter.leaderboard(limit);

        return Response.json(
          {
            game: {
              id: rules.id,
              label: rules.label,
              progressLabel: rules.progressLabel ?? null,
            },
            entries: rows,
          },
          // Leaderboards tolerate being a minute stale and are hit from game
          // over screens, so let the edge absorb the traffic.
          { headers: { 'Cache-Control': 'public, max-age=60' } },
        );
      }),
    },
  },
});
