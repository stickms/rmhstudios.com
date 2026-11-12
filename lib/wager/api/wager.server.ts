import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createWagerApi, listWagersApi } from '@/lib/wager/wager.contract';
import { createWagerSchema } from '@/lib/wager/wager-schema';
import { createWager, listWagers, expireStaleWagers, WagerError } from '@/lib/wager/wager.server';

export const route = apiRoute('/api/wager', {
  GET: implement(listWagersApi, { auth: 'optional' }, async ({ request, session }) => {
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
    return { wagers };
  }),
  POST: implement(
    createWagerApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'wager-create' },
      body: createWagerSchema,
      allowEmptyBody: true,
      invalid: (error) =>
        Response.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ userId, body }) => {
      try {
        const wager = await createWager({
          challengerId: userId,
          gameId: body.gameId,
          stakeCoins: body.stakeCoins,
          opponentId: body.opponentId ?? null,
          expiresInMs: body.expiresInMs,
        });
        return { wager };
      } catch (error) {
        if (error instanceof WagerError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
