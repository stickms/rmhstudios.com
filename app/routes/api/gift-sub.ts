import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { giftMembership, GiftError, GIFT_PRICES, GIFT_TIER_LABELS } from '@/lib/gifting/gift.server';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

const schema = z.object({
  recipient: z.string().min(1).max(64), // id or handle
  tier: z.enum(['starter', 'pro']),
  months: z.number().int().min(1).max(12),
});

/**
 * GET  /api/gift-sub — gift pricing.
 * POST /api/gift-sub — gift a membership to another user with coins.
 */
export const Route = createFileRoute('/api/gift-sub')({
  server: {
    handlers: {
      GET: async () => Response.json({ prices: GIFT_PRICES, labels: GIFT_TIER_LABELS }),

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'gift-sub' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const recipient = await prisma.user.findFirst({
            where: { OR: [{ id: parsed.data.recipient }, { handle: parsed.data.recipient }] },
            select: { id: true },
          });
          if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });

          const result = await giftMembership({
            gifterId: session.user.id,
            recipientId: recipient.id,
            tier: parsed.data.tier,
            months: parsed.data.months,
          });

          await createNotification({
            userId: recipient.id,
            actorId: session.user.id,
            type: 'SYSTEM',
            entityType: 'membership',
            entityId: parsed.data.tier,
            preview: `${session.user.name ?? 'Someone'} gifted you ${parsed.data.months} month(s) of ${GIFT_TIER_LABELS[parsed.data.tier]}!`,
            link: '/pricing',
          }).catch(() => {});
          await grantAchievement(session.user.id, 'economy.first_gift_sub').catch(() => {});

          return Response.json({ success: true, expiresAt: result.expiresAt, cost: result.cost });
        } catch (error) {
          if (error instanceof GiftError) {
            const map: Record<string, [string, number]> = {
              SELF: ["You can't gift yourself", 400],
              INSUFFICIENT_COINS: ['Not enough coins', 400],
            };
            const [msg, status] = map[error.message] ?? ['Gift failed', 400];
            return Response.json({ error: msg }, { status });
          }
          console.error('Gift sub error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
