/** Contracts for creator earnings and redemption requests (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { requestRedemptionSchema } from '@/lib/creator/redemption-schema';
import type { CreatorEarnings } from '@/lib/creator/earnings.server';

export interface RedemptionRow {
  id: string;
  kind:
    | 'SUB_CREDIT'
    | 'MERCH'
    | 'PAYOUT';
  amountCoins: number;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'FULFILLED'
    | 'REJECTED';
  tierGranted:
    | string
    | null;
  monthsGranted:
    | number
    | null;
  createdAt: string;
}

export const getCreatorRedemptionsApi =
  endpoint<{
    res: {
      earnings: CreatorEarnings;
      requests: RedemptionRow[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/creator/redeem',
    },
  );

export const requestRedemptionApi =
  endpoint<{
    body: z.infer<
      typeof requestRedemptionSchema
    >;
    res: {
      ok: true;
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/creator/redeem',
    },
  );
