import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
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
      POST: defineHandler(
        { rateLimit: { limit: 5, windowMs: 60_000, prefix: 'referral-claim' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = claimSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid code' }, { status: 400 });
          }

          const result = await claimReferral(session.user.id, parsed.data.code.toLowerCase());
          return Response.json({ result, claimed: result === 'claimed' });
        },
      ),
    },
  },
});
