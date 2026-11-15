import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { joinCreatorTierApi } from '@/lib/creator/join.contract';
import { joinTierBody } from '@/lib/creator/join-schema';
import { joinTier, TierError } from '@/lib/creator/tiers.server';

/** POST /api/creators/$id/join — join (or renew) creator `$id` at a tier with coins. */
export const route = apiRoute('/api/creators/$id/join', {
  POST: implement(
    joinCreatorTierApi,
    {
      rateLimit: { limit: 15, windowMs: 60_000, prefix: 'creator-join' },
      body: joinTierBody,
      allowEmptyBody: true,
    },
    async ({ session, params, body }) => {
      try {
        const result = await joinTier(session.user.id, params.id, body.tierId);
        return {
          success: true as const,
          expiresAt: result.expiresAt.toISOString(),
          priceCoins: result.priceCoins,
          tierName: result.tierName,
        };
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
        throw error;
      }
    },
  ),
});
