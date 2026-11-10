import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { giftPricesApi, giftSubApi } from '@/lib/gifting/gift.contract';
import { giftSubBody } from '@/lib/gifting/gift-schema';
import { giftMembership, GiftError, GIFT_PRICES, GIFT_TIER_LABELS } from '@/lib/gifting/gift.server';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/**
 * GET  /api/gift-sub — gift pricing.
 * POST /api/gift-sub — gift a membership to another user with coins.
 */
export const Route = createFileRoute('/api/gift-sub')({
  server: {
    handlers: {
      GET: implement(giftPricesApi, { auth: 'none' }, () => ({
        prices: GIFT_PRICES,
        labels: GIFT_TIER_LABELS,
      })),

      POST: implement(
        giftSubApi,
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'gift-sub' },
          body: giftSubBody,
          allowEmptyBody: true,
        },
        async ({ session, body }) => {
          try {
            const recipient = await prisma.user.findFirst({
              where: { OR: [{ id: body.recipient }, { handle: body.recipient }] },
              select: { id: true },
            });
            if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });

            const result = await giftMembership({
              gifterId: session.user.id,
              recipientId: recipient.id,
              tier: body.tier,
              months: body.months,
            });

            await createNotification({
              userId: recipient.id,
              actorId: session.user.id,
              type: 'SYSTEM',
              entityType: 'membership',
              entityId: body.tier,
              preview: `${session.user.name ?? 'Someone'} gifted you ${body.months} month(s) of ${GIFT_TIER_LABELS[body.tier]}!`,
              link: '/store?tab=membership',
            }).catch(() => {});
            await grantAchievement(session.user.id, 'economy.first_gift_sub').catch(() => {});

            return {
              success: true as const,
              expiresAt: result.expiresAt.toISOString(),
              cost: result.cost,
            };
          } catch (error) {
            if (error instanceof GiftError) {
              const map: Record<string, [string, number]> = {
                SELF: ["You can't gift yourself", 400],
                INSUFFICIENT_COINS: ['Not enough coins', 400],
              };
              const [msg, status] = map[error.message] ?? ['Gift failed', 400];
              return Response.json({ error: msg }, { status });
            }
            throw error;
          }
        },
      ),
    },
  },
});
