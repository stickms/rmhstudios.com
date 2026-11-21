/** Input schemas for the inbox's per-item endpoints. Plain zod: the contract imports only the types. */
import { z } from 'zod';
import { MAX_NOTIFICATION_BATCH, NOTIFICATION_FILTER_IDS } from '@/lib/notifications/filters';

export { MAX_NOTIFICATION_BATCH };

const notificationId =
  z
    .string()
    .min(
      1,
    )
    .max(
      64,
    );

export const setReadBody =
  z.object(
    {
      read: z.boolean(),
    },
  );

export const dismissBody =
  z.object(
    {
      ids: z
        .array(
          notificationId,
        )
        .min(
          1,
        )
        .max(
          MAX_NOTIFICATION_BATCH,
        ),
    },
  );

const idPattern =
  '[A-Za-z0-9_-]{1,64}';
const idListPattern =
  new RegExp(
    `^${idPattern}(,${idPattern}){0,${MAX_NOTIFICATION_BATCH - 1}}$`,
  );

/**
 * `GET /api/notifications` query. The query arrives as a flat string record (a repeated key would keep only its
 * last value), so the Unread view's snapshot is ONE comma-separated `unreadIds` param of at most 100 well-formed ids.
 */
export const listQuery =
  z.object(
    {
      cursor:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          )
          .optional(),
      limit:
        z.coerce
          .number()
          .int()
          .min(
            1,
          )
          .max(
            50,
          )
          .optional(),
      filter:
        z
          .enum(
            NOTIFICATION_FILTER_IDS,
          )
          .optional(),
      /** `true`: the Unread view, every row unread now plus the ones unread when the inbox opened (`unreadIds`). */
      unread:
        z
          .literal(
            'true',
          )
          .optional(),
      unreadIds:
        z
          .string()
          .regex(
            idListPattern,
          )
          .optional(),
    },
  );

/** The ids in a validated `unreadIds` param. */
export function splitUnreadIds(
  value:
    | string
    | undefined,
): string[] {
  return value
    ? [
        ...new Set(
          value.split(
            ',',
          ),
        ),
      ]
    : [];
}
