import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { claimReferralApi } from '@/lib/referrals.contract';
import { claimReferralBody } from '@/lib/referrals-schema';
import { claimReferral } from '@/lib/referrals.server';

/**
 * POST /api/referrals/claim — attribute the signed-in (recently created)
 * account to an invite code stored by /ref/$code. Idempotent per account.
 */
export const Route = createFileRoute('/api/referrals/claim')({
  server: {
    handlers: {
      POST: implement(
        claimReferralApi,
        {
          rateLimit: { limit: 5, windowMs: 60_000, prefix: 'referral-claim' },
          body: claimReferralBody,
          invalid: () => Response.json({ error: 'Invalid code' }, { status: 400 }),
        },
        async ({ session, body }) => {
          const result = await claimReferral(session.user.id, body.code.toLowerCase());
          return Response.json({ result, claimed: result === 'claimed' });
        },
      ),
    },
  },
});
