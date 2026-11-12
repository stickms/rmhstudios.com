import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { requestRedemptionApi } from '@/lib/creator/earnings.contract';
import { requestRedemptionSchema } from '@/lib/creator/redemption-schema';
import { assertNoRecoveryHold } from '@/lib/recovery/hold.server';
import {
  getCreatorEarnings,
  listMyRedemptions,
  requestRedemption,
  RedemptionError,
} from '@/lib/creator/earnings.server';

export const route = apiRoute('/api/creator/redeem', {
  GET: defineHandler({}, async ({ session }) => {
    const [earnings, requests] = await Promise.all([
      getCreatorEarnings(session.user.id),
      listMyRedemptions(session.user.id),
    ]);
    return Response.json({ earnings, requests });
  }),
  POST: implement(
    requestRedemptionApi,
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'creator-redeem' },
      body: requestRedemptionSchema,
      invalid: (e) =>
        Response.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ session, body }) => {
      try {
        // A recovered account is held for 72h before it can move value. Without
        // this the hold is reported and not enforced, and account recovery
        // becomes the cheapest route into the economy.
        const held = await assertNoRecoveryHold(session.user.id);
        if (held) return held;

        const req = await requestRedemption({
          userId: session.user.id,
          input: body,
          isVerified: (session.user as { isVerified?: boolean }).isVerified,
        });
        return { ok: true as const, id: req.id };
      } catch (error) {
        if (error instanceof RedemptionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
