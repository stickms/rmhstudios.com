import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { acceptWager, WagerError } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/api/wager/$id/accept')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'wager-accept',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const wager = await acceptWager({ matchId: params.id, userId: session.user.id });
          return Response.json({ wager });
        } catch (error) {
          if (error instanceof WagerError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Wager accept error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
