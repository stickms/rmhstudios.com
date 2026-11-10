import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { placePlinkoBetApi } from '@/lib/coins.contract';
import { prisma } from '@/lib/prisma.server';
import { creditCoins, debitCoins, getBalance } from '@/lib/economy/ledger.server';
import { betSchema } from '@/lib/coins-schema';
import { simulatePlinko } from '@/lib/plinko';

export const Route = createFileRoute('/api/coins/bet')({
  server: {
    handlers: {
      POST: implement(
        placePlinkoBetApi,
        {
          rateLimit: { limit: 300, windowMs: 60_000, prefix: 'coins-bet' },
          body: betSchema,
          // The old route answered with the first zod issue's own message.
          verboseValidationErrors: true,
        },
        async ({ userId, body }) => {
          try {
            const { bin, amount } = body;

            const seed = (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
            const plinkoResult = simulatePlinko(seed);
            const won = plinkoResult.landedBin === bin;

            const result = await prisma.$transaction(async (tx) => {
              // Ensure the profile row exists, then settle the bet with an atomic
              // conditional update instead of writing an absolute balance. Requiring
              // `coins >= amount` in the WHERE clause enforces "must hold the full stake"
              // and prevents both the overdraft and the lost-update that an absolute
              // `coins: newBalance` write allowed against any concurrent balance change.
              // Settle as the two movements it actually is: the stake always leaves
              // circulation, and a win pays 2× back from the house. Net is −amount on a
              // loss and +amount on a win, exactly as before — but now the wager and
              // the payout are separate ledger rows, so the game's coin creation and
              // destruction are both visible to supply reporting instead of netting out
              // into a single unexplained balance change.
              await debitCoins(userId, amount, {
                tx,
                type: 'WAGER',
                entityType: 'plinko',
                note: 'Plinko stake',
              });
              if (won) {
                await creditCoins(userId, amount * 2, {
                  tx,
                  type: 'WAGER',
                  entityType: 'plinko',
                  note: 'Plinko payout',
                });
              }

              return { newBalance: await getBalance(userId, tx) };
            });

            return Response.json({
              won,
              payout: won ? amount * 2 : 0,
              newBalance: result.newBalance,
              startX: plinkoResult.startX,
              landedBin: plinkoResult.landedBin,
            });
          } catch (error) {
            if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
              return Response.json({ error: 'Insufficient coins' }, { status: 400 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
