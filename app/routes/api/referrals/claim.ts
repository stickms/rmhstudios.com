import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { claimReferral } from '@/lib/referrals.server';

/**
 * POST /api/referrals/claim — attribute the signed-in (recently created)
 * account to an invite code stored by /ref/$code. Idempotent per account.
 */
const claimSchema = z.object({
  code: z
    .string()
    .min(4)
    .max(32)
    .regex(/^[a-z0-9]+$/i),
});

export const Route = createFileRoute('/api/referrals/claim')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 5,
            windowMs: 60_000,
            prefix: 'referral-claim',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }

          const body = await request.json().catch(() => null);
          const parsed = claimSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid code' }, { status: 400 });
          }

          const result = await claimReferral(session.user.id, parsed.data.code.toLowerCase());
          return Response.json({ result, claimed: result === 'claimed' });
        } catch (error) {
          console.error('Referral claim error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
