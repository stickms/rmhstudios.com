import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createWagerSchema } from '@/lib/wager/wager-schema';
import { createWager, listWagers, expireStaleWagers, WagerError } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/api/wager/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user?.id ?? null;
          const url = new URL(request.url);
          const filter = url.searchParams.get('filter') === 'mine' ? 'mine' : 'open';
          const gameId = url.searchParams.get('game') ?? undefined;
          if (filter === 'mine' && !viewerId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          // Opportunistically refund challenges that timed out (no cron tier).
          void expireStaleWagers().catch(() => {});
          const wagers = await listWagers({ viewerId, filter, gameId });
          return Response.json({ wagers });
        } catch (error) {
          console.error('Wager list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'wager-create',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }
          const parsed = createWagerSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }
          const wager = await createWager({
            challengerId: session.user.id,
            gameId: parsed.data.gameId,
            stakeCoins: parsed.data.stakeCoins,
            opponentId: parsed.data.opponentId ?? null,
            expiresInMs: parsed.data.expiresInMs,
          });
          return Response.json({ wager });
        } catch (error) {
          if (error instanceof WagerError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Wager create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
