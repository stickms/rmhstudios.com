import { z } from 'zod';
import { MAX_COOL_OFF_DAYS, MAX_DAILY_CAP, MAX_EXCLUSION_DAYS } from '@/lib/economy/play-limits';

/** Request body for `POST /api/settings/play-limits` (client-safe; the contract names its type). */
export const playLimitsChangeSchema = z
  .object({
    /** `null` removes the cap (a loosening, so it waits). Omit to leave alone. */
    dailyCoinCap: z.number().int().min(1).max(MAX_DAILY_CAP).nullable().optional(),
    excludeForDays: z.number().int().min(1).max(MAX_EXCLUSION_DAYS).optional(),
    coolOffForDays: z.number().int().min(1).max(MAX_COOL_OFF_DAYS).optional(),
  })
  .refine(
    (v) =>
      v.dailyCoinCap !== undefined ||
      v.excludeForDays !== undefined ||
      v.coolOffForDays !== undefined,
    { message: 'Nothing to change' },
  );
