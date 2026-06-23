import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserTier } from '@/lib/entitlements';

const PROMO = 'free_month_pro_2026';
const TIER = 'pro';
const MONTHS = 1;

/**
 * GET  /api/promo/free-month — is the viewer eligible for the free month?
 * POST /api/promo/free-month — claim it. Eligibility (free tier + never claimed)
 *      is re-checked server-side; the unique PromoClaim enforces once-ever.
 */
export const Route = createFileRoute('/api/promo/free-month')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        if (!session) return Response.json({ eligible: false });
        const [tier, claimed] = await Promise.all([
          getUserTier(session.user.id),
          prisma.promoClaim.findUnique({ where: { userId_promo: { userId: session.user.id, promo: PROMO } }, select: { id: true } }),
        ]);
        // Offer only to users without an active subscription who haven't claimed.
        return Response.json({ eligible: tier === 'free' && !claimed, tier: TIER, months: MONTHS });
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'promo-claim' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const tier = await getUserTier(userId);
          if (tier !== 'free') {
            return Response.json({ error: 'You already have an active membership.' }, { status: 400 });
          }

          try {
            const expiresAt = new Date(Date.now() + MONTHS * 30 * 24 * 60 * 60 * 1000);
            await prisma.$transaction([
              // The unique [userId, promo] makes this the once-ever guard.
              prisma.promoClaim.create({ data: { userId, promo: PROMO } }),
              prisma.giftMembership.create({ data: { userId, gifterId: null, tier: TIER, expiresAt } }),
            ]);
            return Response.json({ success: true, tier: TIER, months: MONTHS });
          } catch (e) {
            if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
              return Response.json({ error: 'You have already claimed this offer.' }, { status: 409 });
            }
            throw e;
          }
        } catch (error) {
          console.error('Promo claim error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
