import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getLeaderboard, type LeaderboardScope } from '@/lib/leaderboard.server';

/**
 * GET /api/leaderboards/players?scope=global|friends — platform player ranking
 * by lifetime XP / level. "friends" is scoped to the caller's follow graph and
 * falls back to "global" for signed-out callers.
 */
export const Route = createFileRoute('/api/leaderboards/players')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
        const url = new URL(request.url);
        const scope: LeaderboardScope =
          url.searchParams.get('scope') === 'friends' ? 'friends' : 'global';
        const result = await getLeaderboard(session?.user?.id ?? null, scope);
        return Response.json(result);
      }),
    },
  },
});
