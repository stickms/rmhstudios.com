import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { unlockBattlePassApi } from '@/lib/battlepass/battlepass.contract';
import { prisma } from '@/lib/prisma.server';
import { debitCoins } from '@/lib/economy/ledger.server';
import { getActiveSeason } from '@/lib/battlepass/active.server';

/** POST /api/battlepass/unlock — unlock the premium track by spending RMH coins. */
export const route = apiRoute('/api/battlepass/unlock', {
  POST: implement(
    unlockBattlePassApi,
    { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'bp-unlock' } },
    async ({ session }) => {
      try {
        const userId = session.user.id;
        const season = await getActiveSeason();
        const price = season.premiumPrice;

        await prisma.$transaction(async (tx) => {
          await tx.userSeasonProgress.upsert({
            where: { userId_seasonId: { userId, seasonId: season.id } },
            create: { userId, seasonId: season.id },
            update: {},
          });
          // Atomically claim the premium flag (false→true). Concurrent unlocks
          // race here; only the one that actually flips it proceeds to charge,
          // so premium can never be bought twice.
          const flip = await tx.userSeasonProgress.updateMany({
            where: { userId, seasonId: season.id, premium: false },
            data: { premium: true },
          });
          if (flip.count === 0) throw new Error('ALREADY_PREMIUM');

          // Pure SINK; if the debit fails the premium flip above rolls back.
          await debitCoins(userId, price, {
            tx,
            type: 'PURCHASE',
            entityType: 'battlepass',
            entityId: season.id,
            note: 'Premium pass',
            // One premium pass per user per season — a stable dedupe key, so
            // a retried unlock cannot charge twice.
            idempotencyKey: `battlepass:${userId}:${season.id}`,
          });
        });

        return { success: true as const };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'ALREADY_PREMIUM')
            return Response.json({ error: 'Already unlocked' }, { status: 409 });
          if (error.message === 'INSUFFICIENT_COINS')
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
        }
        throw error; // the wrapper logs it and answers the generic 500
      }
    },
  ),
});
