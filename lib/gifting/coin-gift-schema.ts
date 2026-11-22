/** Request schema for POST /api/coins/gift. Client-safe. */
import { z } from 'zod';
import { GIFT_MAX, GIFT_MIN, GIFT_NOTE_MAX } from '@/lib/gifting/coin-gift-limits';

export const coinGiftBody = z.object({
  recipient: z.string().min(1).max(64), // user id or handle
  amount: z.number().int().min(GIFT_MIN).max(GIFT_MAX),
  note: z.string().max(GIFT_NOTE_MAX).optional(),
  public: z.boolean().optional(),
});
