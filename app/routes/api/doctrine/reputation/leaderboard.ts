import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getReputationLeaderboard } from '@/lib/doctrine/reputation';

export const Route = createFileRoute('/api/doctrine/reputation/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'doctrine-rep-lb' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

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
    },
  },
});
