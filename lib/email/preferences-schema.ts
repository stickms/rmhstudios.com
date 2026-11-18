/**
 * The zod schema for PUT /api/preferences/email. Split from `./preferences`,
 * which the settings page imports, so that page stays zod-free.
 */
import { z } from 'zod';

export const emailPrefsSchema =
  z
    .object(
      {
        security:
          z.boolean(),
        announcements:
          z.boolean(),
        product:
          z.boolean(),
        digest:
          z.boolean(),
      },
    )
    .partial()
    .strict();

export type EmailPrefsInput =
  z.infer<
    typeof emailPrefsSchema
  >;
