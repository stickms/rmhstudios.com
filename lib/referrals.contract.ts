/**
 * Contracts for /api/referrals (redesign audit C1, batch 5). Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { claimReferralBody } from './referrals-schema';

/** The caller's invite code (created on first call), share URL, reward and stats. */
export const getMyReferralApi =
  endpoint<{
    res: {
      code: string;
      url: string;
      reward: number;
      invited: number;
      rewarded: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/referrals/me',
    },
  );

/** Attribute the signed-in account to an invite code. 429 means "try again later". */
export const claimReferralApi =
  endpoint<{
    body: z.infer<
      typeof claimReferralBody
    >;
    res: {
      result: string;
      claimed: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/referrals/claim',
    },
  );
