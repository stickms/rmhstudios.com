import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { claimBattlePassTierApi } from '@/lib/battlepass/battlepass.contract';
import { prisma } from '@/lib/prisma.server';
import { creditCoins } from '@/lib/economy/ledger.server';
import { z } from 'zod';
import { CURRENT_SEASON, tierForXp } from '@/lib/battlepass/season';
import { awardXp } from '@/lib/xp/engine.server';
import { getShopItem } from '@/lib/shop/catalog';

/** POST /api/battlepass/claim — claim a reached tier's reward on free/premium track. */
const schema = z.object({ tier: z.number().int().min(1).max(100), track: z.enum(['free', 'paid']) });

/** Carries an HTTP status out of the claim transaction so guard failures roll it back. */
class ClaimError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const Route = createFileRoute('/api/battlepass/claim')({
  server: {
    handlers: {
      POST: implement(claimBattlePassTierApi, { body: schema }, async ({ session, body }) => {
        try {
          const { tier, track } = body;

          const tierDef = CURRENT_SEASON.tiers.find((t) => t.tier === tier);
          if (!tierDef) return Response.json({ error: 'Unknown tier' }, { status: 404 });
          const reward = track === 'free' ? tierDef.free : tierDef.premium;
          if (!reward) return Response.json({ error: 'No reward on this track' }, { status: 400 });

          const userId = session.user.id;

          // The claim guard (tier reached + not already claimed) and the reward grant
          // must be atomic, or concurrent requests all read the same "not claimed" array
          // and each grant the reward (coin/XP duplication). Serializable isolation makes
          // the DB abort all but one of the racing transactions on the same progress row.
          let alreadyClaimed = false;
          await prisma.$transaction(
            async (tx) => {
              const sp = await tx.userSeasonProgress.findUnique({
                where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
              });
              const seasonXp = sp?.seasonXp ?? 0;
              if (tierForXp(seasonXp) < tier) throw new ClaimError('Tier not yet reached', 403);
              if (track === 'paid' && !sp?.premium) throw new ClaimError('Premium track locked', 403);

              const claimedFree = (sp?.claimedFree as number[]) ?? [];
              const claimedPaid = (sp?.claimedPaid as number[]) ?? [];
              const claimed = track === 'free' ? claimedFree : claimedPaid;
              if (claimed.includes(tier)) {
                alreadyClaimed = true;
                return;
              }

              // Record the claim first, then grant, so a serialization conflict aborts
              // before any reward is issued.
              const nextClaimed = [...claimed, tier];
              await tx.userSeasonProgress.update({
                where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
                data: track === 'free' ? { claimedFree: nextClaimed } : { claimedPaid: nextClaimed },
              });

              if (reward.type === 'coins' && reward.amount) {
                // The claimed-tier list is written first (above), so a
                // concurrent claim aborts before reaching this grant.
                await creditCoins(userId, reward.amount, {
                  tx,
                  type: 'REWARD',
                  entityType: 'battlepass',
                  entityId: `${CURRENT_SEASON.id}:${track}:${tier}`,
                  note: 'Battle pass reward',
                });
              } else if (reward.type === 'item' && reward.itemId) {
                const item = getShopItem(reward.itemId);
                if (item) {
                  await tx.userInventory
                    .upsert({
                      where: { userId_itemId: { userId, itemId: item.id } },
                      create: { userId, itemId: item.id, kind: item.kind },
                      update: {},
                    })
                    .catch(() => {});
                }
              }
            },
            { isolationLevel: 'Serializable' },
          );

          if (alreadyClaimed) return Response.json({ error: 'Already claimed' }, { status: 409 });

          // XP is awarded through its own engine (own transaction) after the claim commits.
          if (reward.type === 'xp' && reward.amount) {
            await awardXp(userId, reward.amount);
          }

          return { success: true as const, reward };
        } catch (error) {
          if (error instanceof ClaimError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error; // the wrapper logs it and answers the generic 500
        }
      }),
    },
  },
});
