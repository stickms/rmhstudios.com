/**
 * GET /api/leaderboards/$gameId — one leaderboard endpoint for every scored
 * game, with one response shape, one set of scopes and one rate limit.
 *
 * Before this, a leaderboard read had three front doors:
 * `/api/games/$id/leaderboard` (site), `/api/v1/leaderboards/$game`
 * (developer API) and whatever bespoke route a game shipped with. They agreed
 * on nothing — different limits, different row shapes, different ideas of what
 * a missing game is — and none of them could answer "how do I rank among my
 * friends?", which is the question that makes a leaderboard worth opening
 * twice.
 *
 * What lives here is only the HTTP shape. Where the rows come from is
 * `lib/game/adapters.server.ts`, who is allowed on the board is
 * `lib/game/leaderboard-scope.server.ts`, and what the numbers mean is
 * `lib/game/registry.ts` — this route is the seam that puts the three together.
 *
 * Public (`auth: 'optional'`): a leaderboard is a discovery surface, and
 * requiring a session to see one hides the game from exactly the people who
 * have not played it. A viewer only matters for the scopes that are about them.
 *
 * (`players.ts` sits alongside this file as `/api/leaderboards/players`, the
 * XP board. Static segments outrank dynamic ones, so it keeps its URL and
 * `players` never arrives here as a `$gameId`.)
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getGameAdapter, hasBespokeAdapter, type LeaderboardRow } from '@/lib/game/adapters.server';
import { genericLeaderboardRows } from '@/lib/game/generic-adapter.server';
import { getGameScoreRules } from '@/lib/game/registry';
import {
  scopeFilter,
  windowFilter,
  LEADERBOARD_SCOPES,
  LEADERBOARD_WINDOWS,
} from '@/lib/game/leaderboard-scope.server';

/**
 * Deepest rank a caller can page to. The cursor is a rank offset rather than a
 * keyset (see `cursor` below), so the cost of a page grows with its depth —
 * this is where that stops. Twenty pages of a 25-row board is far past where
 * anyone is still reading.
 */
const MAX_OFFSET = 500;

const querySchema = z.object({
  scope: z.enum(LEADERBOARD_SCOPES).default('global'),
  window: z.enum(LEADERBOARD_WINDOWS).default('all'),
  /** Required by `scope=community`; ignored otherwise. */
  communityId: z.cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /**
   * Opaque continuation token that happens to be a rank offset.
   *
   * Not a keyset cursor, and not by oversight: the shared `GameAdapter`
   * interface exposes `leaderboard(limit)` and nothing else, because the
   * bespoke games behind it have no common column to key on. An offset is the
   * one form of paging that works identically for every game, and `MAX_OFFSET`
   * bounds what it can cost.
   */
  cursor: z.coerce.number().int().min(0).max(MAX_OFFSET).optional(),
});

/**
 * Narrow an already-ranked global board to an audience, in memory.
 *
 * The fallback path for games on a bespoke table: their model is reachable only
 * through `leaderboard(limit)`, so there is no way to push a `userId IN (...)`
 * filter into the query. The honest description of the result is "your friends
 * among the top `MAX_OFFSET` players", not "your friends" — a friend outside
 * that window is missing. Games on the shared `GameStat` table take the exact
 * path instead and do not have this limit; migrating a bespoke game to
 * `GameStat` is what removes it.
 */
function narrowInMemory(rows: LeaderboardRow[], audience: string[]): LeaderboardRow[] {
  const allowed = new Set(audience);
  return (
    rows
      .filter((r) => r.userId !== null && allowed.has(r.userId))
      // Rank is re-stamped: on a friends board the interesting number is "2nd of
      // your friends", not "8,412th overall".
      .map((r, i) => ({ ...r, rank: i + 1 }))
  );
}

export const Route = createFileRoute('/api/leaderboards/$gameId')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: querySchema },
        async ({ params, query, userId }) => {
          const gameId = params.gameId;

          // The registry is the gate, here and in the adapters: an id with no
          // scoring rules has no bounds, no labels and nothing to rank, so it
          // is not a game as far as this endpoint is concerned.
          const rules = getGameScoreRules(gameId);
          const adapter = getGameAdapter(gameId);
          if (!rules || !adapter) {
            return Response.json({ error: 'Unknown game' }, { status: 404 });
          }

          const time = windowFilter(query.window);
          if (!time.supported) {
            return Response.json({ error: time.reason }, { status: time.status });
          }

          const scope = await scopeFilter(query.scope, userId, {
            communityId: query.communityId,
          });
          if (!scope.supported) {
            return Response.json({ error: scope.reason }, { status: scope.status });
          }

          const offset = query.cursor ?? 0;
          const limit = query.limit;

          let rows: LeaderboardRow[];
          if (scope.audience === null) {
            // Unrestricted: read straight through the adapter so every game —
            // bespoke or shared — answers from its own storage exactly as the
            // older endpoints did.
            const page = await adapter.leaderboard(Math.min(offset + limit, MAX_OFFSET + limit));
            rows = page.slice(offset, offset + limit);
          } else if (!hasBespokeAdapter(gameId)) {
            // Shared table: push the audience into the query, so the board is
            // the whole audience rather than the audience's share of the top N.
            rows = await genericLeaderboardRows(gameId, {
              where: { ...scope.where, ...time.where },
              skip: offset,
              take: limit,
            });
          } else {
            const page = await adapter.leaderboard(MAX_OFFSET);
            rows = narrowInMemory(page, scope.audience).slice(offset, offset + limit);
          }

          return Response.json(
            {
              rows,
              rules,
              scope: query.scope,
              // Null means "that was the last page" — a full page is the only
              // signal there might be more, since none of the reads above can
              // report a total without a second count query.
              nextCursor:
                rows.length === limit && offset + limit <= MAX_OFFSET
                  ? String(offset + limit)
                  : null,
            },
            {
              headers: {
                // Only the global board is viewer-independent. A friends or
                // community board is per-viewer by construction, and a shared
                // cache that stored one would hand somebody else's circle to
                // the next reader.
                'Cache-Control':
                  query.scope === 'global' ? 'public, max-age=60' : 'private, no-store',
              },
            },
          );
        },
      ),
    },
  },
});
