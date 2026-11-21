/**
 * Zod schemas for the RMHMusic practice-log endpoints. Imported by the route modules and the
 * writers' body schemas only; the client reaches the types through `history.contract.ts` with
 * `import type`.
 */
import { z } from 'zod';
import {
  MAX_DURATION_MS,
  MAX_WEEK_OFFSET,
  PRACTICE_KINDS,
} from '@/lib/rmhmusic/history';

/**
 * The optional `durationMs` the six writers' bodies carry: how long the finished activity took,
 * measured by the client. The client never sends more than {@link MAX_DURATION_MS}; the server
 * clamps what it stores in any case (`clampDurationMs`).
 */
export const durationMsSchema =
  z
    .number()
    .int()
    .min(
      0,
    )
    .max(
      MAX_DURATION_MS,
    )
    .optional();

export const summaryQuery =
  z.object(
    {
      tz: z
        .string()
        .min(
          1,
        )
        .max(
          64,
        )
        .optional(),
      /** 0 is the current week, up to {@link MAX_WEEK_OFFSET} weeks back. */
      week: z.coerce
        .number()
        .int()
        .min(
          0,
        )
        .max(
          MAX_WEEK_OFFSET,
        )
        .optional(),
      /** The week's first day, `Date#getUTCDay()` numbering; Monday when omitted. */
      firstDay:
        z.coerce
          .number()
          .int()
          .min(
            0,
          )
          .max(
            6,
          )
          .optional(),
    },
  );

export const entriesQuery =
  z.object(
    {
      kind: z
        .enum(
          PRACTICE_KINDS,
        )
        .optional(),
      /** The `id` of the last entry of the previous page. */
      cursor:
        z
          .string()
          .regex(
            /^\d{1,18}$/,
          )
          .optional(),
    },
  );

export const songProgressQuery =
  z.object(
    {
      mode: z
        .enum(
          [
            'wait',
            'play',
          ],
        )
        .optional(),
    },
  );
