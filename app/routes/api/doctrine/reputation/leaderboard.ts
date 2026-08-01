import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getReputationLeaderboard } from '@/lib/doctrine/reputation';

export const Route = createFileRoute('/api/doctrine/reputation/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'doctrine-rep-lb' } },
        async ({ request }) => {
          try {
            const url = new URL(request.url);
            const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
            const leaderboard = await getReputationLeaderboard(limit);
            return Response.json(leaderboard);
          } catch (e) {
            console.error('Doctrine reputation leaderboard failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
