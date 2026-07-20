import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { joinTier, TierError } from '@/lib/creator/tiers.server';

const schema = z.object({ tierId: z.string().min(1).max(64) });

/** POST /api/creators/$id/join — join (or renew) creator `$id` at a tier with coins. */
export const Route = createFileRoute('/api/creators/$id/join')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 15,
            windowMs: 60_000,
            prefix: 'creator-join',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await joinTier(session.user.id, params.id, parsed.data.tierId);
          return Response.json({
            success: true,
            expiresAt: result.expiresAt.toISOString(),
            priceCoins: result.priceCoins,
            tierName: result.tierName,
          });
        } catch (error) {
          if (error instanceof TierError) {
            const map: Record<TierError['code'], [string, number]> = {
              SELF: ['You cannot support yourself', 400],
              NOT_FOUND: ['That tier is not available', 404],
              INSUFFICIENT_COINS: ['Not enough coins', 400],
              INVALID: ['Invalid request', 400],
            };
            const [msg, status] = map[error.code] ?? [error.message, 400];
            return Response.json({ error: msg }, { status });
          }
          console.error('Creator join error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
