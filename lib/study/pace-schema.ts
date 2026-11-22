import { z } from 'zod';
import { MAX_NEW_PER_DAY } from '@/lib/study/pace';

const tz = z.string().min(1).max(64).optional();

/**
 * PATCH /api/study/decks/$id/pace: the pace and the test date (either may be sent alone, `null` clears), or
 * `learnMore: true` ("Learn 10 more" for the rest of the day). `tz` is the member's zone; unknown means UTC.
 */
export const paceBody = z
  .object({
    newPerDay: z.number().int().min(0).max(MAX_NEW_PER_DAY).nullable().optional(),
    testDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    learnMore: z.literal(true).optional(),
    tz,
  })
  .refine(
    (b) =>
      b.learnMore === true
        ? b.newPerDay === undefined && b.testDate === undefined
        : b.newPerDay !== undefined || b.testDate !== undefined,
    { message: 'Send a pace, a test date or learnMore' },
  );

/** GET /api/study/decks/$id/pace?tz= */
export const paceQuery = z.object({ tz });
