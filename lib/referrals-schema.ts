/** Request schema for POST /api/referrals/claim. Client-safe. */
import { z } from 'zod';

export const claimReferralBody =
  z.object(
    {
      code: z
        .string()
        .min(
          4,
        )
        .max(
          32,
        )
        .regex(
          /^[a-z0-9]+$/i,
        ),
    },
  );
