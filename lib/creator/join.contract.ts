/** Contract for /api/creators/$id/join (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { joinTierBody } from '@/lib/creator/join-schema';

export const joinCreatorTierApi =
  endpoint<{
    body: z.infer<
      typeof joinTierBody
    >;
    res: {
      success: true;
      expiresAt: string;
      priceCoins: number;
      tierName: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/creators/$id/join',
    },
  );
