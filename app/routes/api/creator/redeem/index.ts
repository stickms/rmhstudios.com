import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { requestRedemptionSchema } from '@/lib/creator/redemption-schema';
import {
  getCreatorEarnings,
  listMyRedemptions,
  requestRedemption,
  RedemptionError,
} from '@/lib/creator/earnings.server';

export const Route = createFileRoute('/api/creator/redeem/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const [earnings, requests] = await Promise.all([
            getCreatorEarnings(session.user.id),
            listMyRedemptions(session.user.id),
          ]);
          return Response.json({ earnings, requests });
        } catch (error) {
          console.error('Creator earnings error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 10,
            windowMs: 60_000,
            prefix: 'creator-redeem',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = requestRedemptionSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }
          const req = await requestRedemption({
            userId: session.user.id,
            input: parsed.data,
            isVerified: (session.user as { isVerified?: boolean }).isVerified,
          });
          return Response.json({ ok: true, id: req.id });
        } catch (error) {
          if (error instanceof RedemptionError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Creator redeem error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
