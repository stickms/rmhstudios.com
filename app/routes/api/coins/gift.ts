import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  sendCoinGift,
  CoinGiftError,
  GIFT_MIN,
  GIFT_MAX,
  GIFT_NOTE_MAX,
} from '@/lib/gifting/coin-gift.server';

const schema = z.object({
  recipient: z.string().min(1).max(64), // user id or handle
  amount: z.number().int().min(GIFT_MIN).max(GIFT_MAX),
  note: z.string().max(GIFT_NOTE_MAX).optional(),
  public: z.boolean().optional(),
});

/** Map each typed gift error to an HTTP status + message. */
const ERROR_MAP: Record<string, [string, number]> = {
  SELF: ["You can't gift yourself", 400],
  DISABLED: ['This user is not accepting gifts', 403],
  INSUFFICIENT_COINS: ['Not enough coins', 400],
  CAP: ["You've hit today's gift limit", 429],
  INVALID: ['Invalid gift', 400],
};

/**
 * POST /api/coins/gift — send another user a coin gift (Gifting v2, §9).
 * Resolves the recipient by id or handle (like /api/gift-sub), then delegates to
 * sendCoinGift, which owns the balance/cap/opt-out guards and the atomic transfer.
 */
export const Route = createFileRoute('/api/coins/gift')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 15,
            windowMs: 60_000,
            prefix: 'coin-gift',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const recipient = await prisma.user.findFirst({
            where: { OR: [{ id: parsed.data.recipient }, { handle: parsed.data.recipient }] },
            select: { id: true },
          });
          if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });

          await sendCoinGift({
            gifterId: session.user.id,
            recipientId: recipient.id,
            amount: parsed.data.amount,
            note: parsed.data.note,
            public: parsed.data.public,
          });

          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof CoinGiftError) {
            const [msg, status] = ERROR_MAP[error.code] ?? ['Gift failed', 400];
            return Response.json({ error: msg, code: error.code }, { status });
          }
          console.error('Coin gift error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
