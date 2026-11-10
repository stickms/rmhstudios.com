/** Contracts for /api/gift-sub (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { giftSubBody } from '@/lib/gifting/gift-schema';

export const giftPricesApi = endpoint<{
  res: { prices: Record<string, number>; labels: Record<string, string> };
}>()({ method: 'GET', path: '/api/gift-sub' });

export const giftSubApi = endpoint<{
  body: z.infer<typeof giftSubBody>;
  res: { success: true; expiresAt: string; cost: number };
}>()({ method: 'POST', path: '/api/gift-sub' });
