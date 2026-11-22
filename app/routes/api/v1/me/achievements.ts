import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { parsePage } from '@/lib/api/serializers.server';
import { loadUnlockedAchievements } from '@/lib/api/games-data.server';
import { achievementsQuerySchema, parseAchievementCursor } from '@/lib/api/games-serializers.server';
import { isTrackableTitle } from '@/lib/games/route-match';

/**
 * GET /api/v1/me/achievements — the key owner's unlocked achievements, newest
 * first. Secret achievements are never listed, and nobody else's are readable.
 */
export const Route = createFileRoute('/api/v1/me/achievements')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const url = new URL(request.url);
            const { limit, cursor: rawCursor } = parsePage(url, {
              maxLimit: 100,
            });
            const query = achievementsQuerySchema.safeParse({
              gameId: url.searchParams.get('gameId') ?? undefined,
            });
            if (!query.success) return error('invalid_request', 'Invalid `gameId`.', 400);
            const { gameId } = query.data;
            if (gameId && !isTrackableTitle(gameId)) return error('invalid_request', 'Unknown game.', 400);

            const cursor = parseAchievementCursor(rawCursor);
            if (rawCursor && !cursor) return error('invalid_request', 'Invalid cursor.', 400);

            return json(
              await loadUnlockedAchievements(userId, {
                gameId,
                cursor,
                limit,
              }),
            );
          },
          {
            scope: 'read:games',
          },
        ),
    },
  },
});
