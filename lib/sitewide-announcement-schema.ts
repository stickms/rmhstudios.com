/**
 * Sitewide announcements — zod schemas. Kept apart from
 * `./sitewide-announcement.ts` so the client modules the home feed loads never
 * pull zod in (`lib/__tests__/zod-off-hot-routes.test.ts`).
 */

import { z } from 'zod';
import {
  BUSINESS_IDS,
  DEFAULT_BUSINESS_ID,
} from './businesses';

/** Announcement fields accepted by `POST /api/admin/blog` alongside the post. */
export const saveAnnouncementFieldsSchema =
  z.object(
    {
      announcement:
        z
          .boolean()
          .default(
            false,
          ),
      business:
        z
          .enum(
            BUSINESS_IDS,
          )
          .default(
            DEFAULT_BUSINESS_ID,
          ),
      /** ISO datetime, or empty/absent for the default lifetime. */
      announcementExpiresAt:
        z
          .string()
          .datetime(
            {
              offset: true,
            },
          )
          .nullish()
          .or(
            z.literal(
              '',
            ),
          ),
    },
  );

export type SaveAnnouncementFields =
  z.infer<
    typeof saveAnnouncementFieldsSchema
  >;

/** Body of `POST /api/sitewide-announcement/seen`. */
export const markSeenSchema =
  z.object(
    {
      id: z
        .string()
        .min(
          1,
        )
        .max(
          64,
        ),
    },
  );
