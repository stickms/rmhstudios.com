import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { MAX_STAKE, deposit } from '@/lib/staking/staking.server';

const schema = z.object({ amount: z.number().int().min(1).max(MAX_STAKE) });

/** POST /api/staking/deposit — move coins from wallet into the vault. */
export const Route = createFileRoute('/api/staking/deposit')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'stake-deposit' }, body: schema },
        async ({ userId, body }) => {
          try {
            const stake = await deposit(userId, body.amount);
            return Response.json({ success: true, stake });
          } catch (error) {
            if (error instanceof Error) {
              if (error.message === 'INSUFFICIENT_COINS') {
                return Response.json({ error: 'Not enough coins' }, { status: 400 });
              }
              if (error.message === 'STAKE_TOO_LARGE') {
                return Response.json({ error: 'Vault is full' }, { status: 400 });
              }
            }
            throw error;
          }
        },
      ),
    },
  },
});
