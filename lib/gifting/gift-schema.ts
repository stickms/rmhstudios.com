/** Client-safe request shape for /api/gift-sub (the route and its contract share it). */
import { z } from 'zod';

export const giftSubBody =
  z.object(
    {
      recipient:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          ), // id or handle
      tier: z.enum(
        [
          'starter',
          'pro',
        ],
      ),
      months:
        z
          .number()
          .int()
          .min(
            1,
          )
          .max(
            12,
          ),
    },
  );
