import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { withdraw } from '@/lib/staking/staking.server';

// amount = principal to pull out (0 = claim accrued interest only).
const schema = z.object({ amount: z.number().int().min(0).max(10_000_000) });

/** POST /api/staking/withdraw — pay out accrued interest + requested principal. */
export const Route = createFileRoute('/api/staking/withdraw')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'stake-withdraw' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid amount' }, { status: 400 });

          const result = await withdraw(session.user.id, parsed.data.amount);
          return Response.json({ success: true, ...result });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === 'NO_STAKE') return Response.json({ error: 'Nothing staked' }, { status: 400 });
            if (error.message === 'AMOUNT_TOO_HIGH') return Response.json({ error: 'More than staked' }, { status: 400 });
          }
          console.error('Staking withdraw error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
