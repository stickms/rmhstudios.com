/** Query schemas for the RMHType progress endpoints. */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/calendar/tz';
import {
  PROGRESS_MODES,
  PROGRESS_RANGES,
  parseRunCursor,
} from '@/lib/rmhtype/progress';

const mode =
  z.enum(
    PROGRESS_MODES,
  );

export const progressQuery =
  z.object(
    {
      range:
        z.enum(
          PROGRESS_RANGES,
        ),
      mode,
      tz: z
        .string()
        .refine(
          isValidTimeZone,
        ),
    },
  );

export const progressRunsQuery =
  z.object(
    {
      mode,
      cursor:
        z
          .string()
          .max(
            80,
          )
          .refine(
            (
              c,
            ) =>
              parseRunCursor(
                c,
              ) !==
              null,
          )
          .optional(),
    },
  );
