import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getLeaderboard, type LeaderboardScope } from '@/lib/leaderboard.server';

/**
 * GET /api/leaderboards/players?scope=global|friends — platform player ranking
 * by lifetime XP / level. "friends" is scoped to the caller's follow graph and
 * falls back to "global" for signed-out callers.
 */
export const Route = createFileRoute('/api/leaderboards/players')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const url = new URL(request.url);
          const scope: LeaderboardScope = url.searchParams.get('scope') === 'friends' ? 'friends' : 'global';
          const result = await getLeaderboard(session?.user?.id ?? null, scope);
          return Response.json(result);
        } catch (error) {
          console.error('Leaderboard fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
