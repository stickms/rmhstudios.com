import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { MAX_STAKE, withdraw } from '@/lib/staking/staking.server';

// amount = principal to pull out (0 = claim accrued interest only).
const schema = z.object({ amount: z.number().int().min(0).max(MAX_STAKE) });

/** POST /api/staking/withdraw — pay out accrued interest + requested principal. */
export const Route = createFileRoute('/api/staking/withdraw')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'stake-withdraw' }, body: schema },
        async ({ userId, body }) => {
          try {
            const result = await withdraw(userId, body.amount);
            return Response.json({ success: true, ...result });
          } catch (error) {
            if (error instanceof Error) {
              if (error.message === 'NO_STAKE') return Response.json({ error: 'Nothing staked' }, { status: 400 });
              if (error.message === 'AMOUNT_TOO_HIGH') return Response.json({ error: 'More than staked' }, { status: 400 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
