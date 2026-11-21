/** Zod for the inbox endpoints (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import {
  FEEDBACK_OUTCOMES,
  FEEDBACK_STATUSES,
  INBOX_PAGE_SIZE,
  NOTE_MAX,
  REPLY_MAX,
  decodeCursor,
  statusChangeError,
} from '@/lib/feedback/inbox';
import { FEEDBACK_CATEGORIES } from '@/lib/feedback-schema';

export const listFeedbackQuerySchema =
  z.object(
    {
      status:
        z
          .enum(
            FEEDBACK_STATUSES,
          )
          .optional(),
      category:
        z
          .enum(
            FEEDBACK_CATEGORIES,
          )
          .optional(),
      q: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          100,
        )
        .optional(),
      after:
        z
          .string()
          .max(
            80,
          )
          .refine(
            (
              c,
            ) =>
              decodeCursor(
                c,
              ) !==
              null,
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
    },
  );

/**
 * One edit to a feedback row. At least one field; a closed status carries an outcome and nothing else does.
 * An empty `adminNote` clears the note; `reply` cannot be cleared once sent.
 */
export const updateFeedbackBodySchema =
  z
    .object(
      {
        status:
          z
            .enum(
              FEEDBACK_STATUSES,
            )
            .optional(),
        outcome:
          z
            .enum(
              FEEDBACK_OUTCOMES,
            )
            .optional(),
        adminNote:
          z
            .string()
            .max(
              NOTE_MAX,
            )
            .optional(),
        reply:
          z
            .string()
            .trim()
            .min(
              1,
            )
            .max(
              REPLY_MAX,
            )
            .optional(),
      },
    )
    .superRefine(
      (
        b,
        ctx,
      ) => {
        if (
          b.status ===
            undefined &&
          b.outcome ===
            undefined &&
          b.adminNote ===
            undefined &&
          b.reply ===
            undefined
        ) {
          ctx.addIssue(
            {
              code: 'custom',
              message:
                'Nothing to change',
            },
          );
          return;
        }
        if (
          b.outcome !==
            undefined &&
          b.status ===
            undefined
        ) {
          ctx.addIssue(
            {
              code: 'custom',
              message:
                'An outcome needs a status',
            },
          );
          return;
        }
        if (
          b.status !==
          undefined
        ) {
          const e =
            statusChangeError(
              b.status,
              b.outcome,
            );
          if (
            e
          )
            ctx.addIssue(
              {
                code: 'custom',
                message:
                  e,
              },
            );
        }
      },
    );

export const FEEDBACK_ID =
  /^[A-Za-z0-9_-]{1,40}$/;
export { INBOX_PAGE_SIZE };
