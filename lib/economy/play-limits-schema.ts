import { z } from 'zod';
import { MAX_SPEND_CAP, MIN_SPEND_CAP } from '@/lib/economy/spend-budget';
import { MAX_COOL_OFF_DAYS, MAX_DAILY_CAP, MAX_EXCLUSION_DAYS } from '@/lib/economy/play-limits';

/** Request body for `POST /api/settings/play-limits` (client-safe; the contract names its type). */
export const playLimitsChangeSchema = z
  .object({
    /** `null` removes the cap (a loosening, so it waits). Omit to leave alone. */
    dailyCoinCap: z.number().int().min(1).max(MAX_DAILY_CAP).nullable().optional(),
    /** Monthly spending budget (s04-07). `null` removes it (a loosening, so it waits). */
    monthlySpendCap: z.number().int().min(MIN_SPEND_CAP).max(MAX_SPEND_CAP).nullable().optional(),
    /** Drop a raise or removal of the budget that is still waiting. */
    cancelPendingSpendCap: z.literal(true).optional(),
    excludeForDays: z.number().int().min(1).max(MAX_EXCLUSION_DAYS).optional(),
    coolOffForDays: z.number().int().min(1).max(MAX_COOL_OFF_DAYS).optional(),
  })
  .refine(
    (v) =>
      v.dailyCoinCap !== undefined ||
      v.excludeForDays !== undefined ||
      v.coolOffForDays !== undefined ||
      v.monthlySpendCap !== undefined ||
      v.cancelPendingSpendCap === true,
    {
      message: 'Nothing to change',
    },
  )
  .refine((v) => !(v.monthlySpendCap !== undefined && v.cancelPendingSpendCap), {
    message: 'Set the budget or cancel the pending change, not both',
  });
