/** Body and query schemas for the RMHType daily endpoints. */
import { z } from 'zod';
import { DAY_PATTERN } from '@/lib/rmhtype/daily';

const day =
  z
    .string()
    .regex(
      DAY_PATTERN,
    );

export const dailyFinishBody =
  z.object(
    {
      day,
      correct:
        z
          .number()
          .int()
          .min(
            0,
          )
          .max(
            100_000,
          ),
      total:
        z
          .number()
          .int()
          .min(
            0,
          )
          .max(
            100_000,
          ),
    },
  );

export const dailyLeaderboardQuery =
  z.object(
    {
      day,
      scope:
        z.enum(
          [
            'global',
            'friends',
          ],
        ),
    },
  );
