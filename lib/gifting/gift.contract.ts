/** Contracts for /api/gift-sub and /api/coins/gift (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { coinGiftBody } from '@/lib/gifting/coin-gift-schema';
import type { giftSubBody } from '@/lib/gifting/gift-schema';

export const giftPricesApi =
  endpoint<{
    res: {
      prices: Record<
        string,
        number
      >;
      labels: Record<
        string,
        string
      >;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/gift-sub',
    },
  );

export const giftSubApi =
  endpoint<{
    body: z.infer<
      typeof giftSubBody
    >;
    res: {
      success: true;
      expiresAt: string;
      cost: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/gift-sub',
    },
  );

/**
 * Send coins to another user (by id or handle). A refusal is `{ error, code }` with
 * code SELF | DISABLED | INSUFFICIENT_COINS | CAP | INVALID; 404 when the recipient is unknown.
 */
export const coinGiftApi =
  endpoint<{
    body: z.infer<
      typeof coinGiftBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/coins/gift',
    },
  );
