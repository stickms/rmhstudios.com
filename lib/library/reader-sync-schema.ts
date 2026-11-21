/**
 * Library reader sync — zod schemas for the marks endpoints. Server-side
 * validation only; the client imports the inferred types through
 * `reader-sync.contract.ts`, so no zod ships to the browser.
 */
import { z } from 'zod';
import {
  CLIENT_ID_RE,
  MARK_KINDS,
  MAX_BATCH,
  MAX_LABEL,
  MAX_LOCATION,
  MAX_NOTE,
  MAX_PAGE,
} from '@/lib/library/reader-sync';

/** A library slug as it appears in the path. */
export const readerSlug =
  z
    .string()
    .min(
      1,
    )
    .max(
      200,
    );

const epochMs =
  z
    .number()
    .int()
    .min(
      0,
    )
    .max(
      4_102_444_800_000,
    );
const page =
  z
    .number()
    .int()
    .min(
      1,
    )
    .max(
      MAX_PAGE,
    );

export const placeInput =
  z.object(
    {
      page,
      location:
        z
          .string()
          .max(
            MAX_LOCATION,
          )
          .nullable(),
      updatedAt:
        epochMs,
    },
  );

export const markInput =
  z
    .object(
      {
        id: z
          .string()
          .regex(
            CLIENT_ID_RE,
          ),
        kind: z.enum(
          MARK_KINDS,
        ),
        page,
        label:
          z
            .string()
            .max(
              MAX_LABEL,
            )
            .nullable(),
        body: z
          .string()
          .max(
            MAX_NOTE,
          )
          .nullable(),
        createdAt:
          epochMs,
        updatedAt:
          epochMs,
        deletedAt:
          epochMs.nullable(),
      },
    )
    .refine(
      (
        m,
      ) =>
        m.kind ===
          'note' ||
        m.body ===
          null,
      {
        message:
          'a bookmark has no body',
        path: [
          'body',
        ],
      },
    );

export const putMarksBody =
  z.object(
    {
      place:
        placeInput.optional(),
      marks:
        z
          .array(
            markInput,
          )
          .max(
            MAX_BATCH,
          )
          .default(
            [],
          ),
    },
  );

export type PutMarksBody =
  z.infer<
    typeof putMarksBody
  >;
