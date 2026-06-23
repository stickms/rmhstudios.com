import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { deposit } from '@/lib/staking/staking.server';

const schema = z.object({ amount: z.number().int().min(1).max(10_000_000) });

/** POST /api/staking/deposit — move coins from wallet into the vault. */
export const Route = createFileRoute('/api/staking/deposit')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'stake-deposit' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid amount' }, { status: 400 });

          const stake = await deposit(session.user.id, parsed.data.amount);
          return Response.json({ success: true, stake });
        } catch (error) {
          if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Staking deposit error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
