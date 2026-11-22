/**
 * Zod schemas for the RMHStudy history endpoints. Imported by the route modules only; the
 * client reaches the types through `history.contract.ts` with `import type`.
 */
import { z } from 'zod';
import { GOAL_MAX_MINUTES, GOAL_MIN_MINUTES, MAX_WEEK_OFFSET } from '@/lib/rmhstudy/history';

export const historyQuery = z.object({
  tz: z.string().min(1).max(64).optional(),
  /** 0 is the current week, up to {@link MAX_WEEK_OFFSET} weeks back. */
  weekOffset: z.coerce.number().int().min(0).max(MAX_WEEK_OFFSET).optional(),
  /** The week's first day, `Date#getUTCDay()` numbering; Monday when omitted. */
  firstDay: z.coerce.number().int().min(0).max(6).optional(),
});

export const sessionsQuery = z.object({
  /** `<startedAt ms>.<id>` of the last row of the previous page. */
  cursor: z
    .string()
    .regex(/^\d{1,15}\.[A-Za-z0-9_-]{1,40}$/)
    .optional(),
});

/** `minutes: null` clears the goal. */
export const goalBody = z.object({
  minutes: z.number().int().min(GOAL_MIN_MINUTES).max(GOAL_MAX_MINUTES).nullable(),
});
