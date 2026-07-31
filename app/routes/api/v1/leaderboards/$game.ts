import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { getGameAdapter, adapterGameIds } from '@/lib/game/adapters.server';

/**
 * GET /api/v1/leaderboards/{game} — top scores for a supported game.
 *
 * This route used to carry its own hard-coded game list and a switch statement
 * of Prisma queries — a fourth copy of "which model backs which game", after
 * the per-game score routes, the per-game leaderboard routes and the site
 * catalog. It now reads the shared adapters, so a new game appears here the
 * moment it has one, and a schema change is made in exactly one place.
 *
 * The response shape is unchanged: `{ game, metric, data }`. The `laundry`
 * alias is preserved because published API clients use it.
 */

/**
 * Public API game ids that differ from the internal adapter id. The v1 API
 * shipped `laundry`; the internal id is `laundry-sort`. Renaming the public one
 * would break every existing client, so it is mapped instead.
 */
const PUBLIC_ALIASES: Record<string, string> = { laundry: 'laundry-sort' };

/** Public ids, in a stable order, for the error message and docs. */
function supportedIds(): string[] {
  const internalToPublic = new Map(
    Object.entries(PUBLIC_ALIASES).map(([pub, internal]) => [internal, pub])
  );
  return adapterGameIds()
    .map((id) => internalToPublic.get(id) ?? id)
    .sort();
}

export const Route = createFileRoute('/api/v1/leaderboards/$game')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const requested = params.game;
            const internalId = PUBLIC_ALIASES[requested] ?? requested;
            const adapter = getGameAdapter(internalId);
            if (!adapter) {
              return error(
                'invalid_request',
                `Unknown game. Supported: ${supportedIds().join(', ')}.`,
                400
              );
            }

            const url = new URL(request.url);
            const raw = parseInt(url.searchParams.get('limit') || '25', 10);
            const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 25, 100);

            const entries = await adapter.leaderboard(limit);
            return json({
              game: requested,
              metric: adapter.metric,
              data: entries.map((e) => ({
                rank: e.rank,
                username: e.username,
                score: e.score,
                progress: e.progress,
              })),
            });
          },
          { scope: 'read:leaderboards' }
        ),
    },
  },
});
