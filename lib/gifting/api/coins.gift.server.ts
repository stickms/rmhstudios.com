import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { coinGiftBody } from '@/lib/gifting/coin-gift-schema';
import { coinGiftApi } from '@/lib/gifting/gift.contract';
import { assertNoRecoveryHold } from '@/lib/recovery/hold.server';
import { sendCoinGift, CoinGiftError } from '@/lib/gifting/coin-gift.server';

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
export const route = apiRoute('/api/coins/gift', {
  POST: implement(
    coinGiftApi,
    {
      rateLimit: { limit: 15, windowMs: 60_000, prefix: 'coin-gift' },
      body: coinGiftBody,
    },
    async ({ userId, body }) => {
      try {
        const held = await assertNoRecoveryHold(userId);
        if (held) return held;

        const recipient = await prisma.user.findFirst({
          where: { OR: [{ id: body.recipient }, { handle: body.recipient }] },
          select: { id: true },
        });
        if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });

        await sendCoinGift({
          gifterId: userId,
          recipientId: recipient.id,
          amount: body.amount,
          note: body.note,
          public: body.public,
        });

        return { ok: true as const };
      } catch (error) {
        if (error instanceof CoinGiftError) {
          const [msg, status] = ERROR_MAP[error.code] ?? ['Gift failed', 400];
          return Response.json({ error: msg, code: error.code }, { status });
        }
        throw error;
      }
    },
  ),
});
