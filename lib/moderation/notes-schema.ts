/** Request schemas for moderator notes (s03-04). Plain zod, no I/O. */
import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '@/lib/moderation/notes';

const noteText =
  z
    .string()
    .trim()
    .min(
      1,
    )
    .max(
      MAX_NOTE_LENGTH,
    );

export const createNoteBody =
  z.object(
    {
      body: noteText,
      /** One of the member's own reports. */
      reportId:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          )
          .optional(),
      /** One of the member's own strikes. */
      strikeId:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          )
          .optional(),
    },
  );

/** Edit the text (the author, within 24 hours) and/or pin or unpin (any admin). */
export const patchNoteBody =
  z
    .object(
      {
        body: noteText.optional(),
        pinned:
          z
            .boolean()
            .optional(),
      },
    )
    .refine(
      (
        v,
      ) =>
        v.body !==
          undefined ||
        v.pinned !==
          undefined,
      {
        message:
          'Nothing to change',
      },
    );

export const listNotesQuery =
  z.object(
    {
      q: z
        .string()
        .trim()
        .max(
          100,
        )
        .optional(),
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
    },
  );
