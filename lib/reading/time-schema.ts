/** Reading time (sprint 07 18) — zod schemas. Server and tests only; contracts use `import type`. */
import { z } from 'zod';
import { READING_DOC_KINDS } from '@/lib/reading/schema';
import {
  MAX_SECONDS_PER_REQUEST,
  WEEKLY_TARGET_MAX,
  WEEKLY_TARGET_MIN,
} from '@/lib/reading/time';

export const recordTimeBody =
  z.object(
    {
      kind: z.enum(
        READING_DOC_KINDS,
      ),
      key: z
        .string()
        .min(
          1,
        )
        .max(
          200,
        ),
      seconds:
        z
          .number()
          .int()
          .min(
            1,
          )
          .max(
            MAX_SECONDS_PER_REQUEST,
          ),
      tz: z
        .string()
        .max(
          64,
        )
        .optional(),
    },
  );

export const timeSummaryQuery =
  z.object(
    {
      tz: z
        .string()
        .max(
          64,
        )
        .optional(),
      locale:
        z
          .string()
          .max(
            35,
          )
          .optional(),
    },
  );

export const timePrefsQuery =
  z.object(
    {
      kind: z
        .enum(
          READING_DOC_KINDS,
        )
        .optional(),
      key: z
        .string()
        .min(
          1,
        )
        .max(
          200,
        )
        .optional(),
    },
  );

export const timePrefsBody =
  z
    .object(
      {
        trackTime:
          z
            .boolean()
            .optional(),
        weeklyMinutesTarget:
          z
            .number()
            .int()
            .min(
              WEEKLY_TARGET_MIN,
            )
            .max(
              WEEKLY_TARGET_MAX,
            )
            .nullable()
            .optional(),
      },
    )
    .refine(
      (
        b,
      ) =>
        b.trackTime !==
          undefined ||
        b.weeklyMinutesTarget !==
          undefined,
      {
        message:
          'Nothing to change',
      },
    );
