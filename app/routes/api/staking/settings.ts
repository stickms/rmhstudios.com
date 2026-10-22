import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setAutoReinvest } from '@/lib/staking/staking.server';

const schema = z.object({ autoReinvest: z.boolean() });

/** POST /api/staking/settings — toggle compounding interest back into the stake. */
export const Route = createFileRoute('/api/staking/settings')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'stake-settings' }, body: schema },
        async ({ userId, body }) => {
          const stake = await setAutoReinvest(userId, body.autoReinvest);
          return Response.json({ success: true, stake });
        },
      ),
    },
  },
});
