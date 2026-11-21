/** Request schemas for the flag targeting endpoints (shared by the routes and `targeting.contract.ts`). */
import { z } from 'zod';
import { HANDLE_MAX_LENGTH } from '@/lib/handle';
import { MAX_EDIT_IDS } from './targeting';

/** A handle as typed in the panel: optional leading @, any case. Stored handles are lowercase. */
const typedHandle =
  z
    .string()
    .trim()
    .transform(
      (
        h,
      ) =>
        h
          .replace(
            /^@/,
            '',
          )
          .toLowerCase(),
    )
    .pipe(
      z
        .string()
        .min(
          1,
        )
        .max(
          HANDLE_MAX_LENGTH,
        ),
    );

export const targetingEditBody =
  z
    .object(
      {
        list: z.enum(
          [
            'allow',
            'deny',
          ],
        ),
        /** Handles to add; the server resolves them to member ids. */
        add: z
          .array(
            typedHandle,
          )
          .max(
            MAX_EDIT_IDS,
          )
          .default(
            [],
          ),
        /** Member ids to remove (the panel has them from the GET). */
        remove:
          z
            .array(
              z
                .string()
                .min(
                  1,
                )
                .max(
                  64,
                ),
            )
            .max(
              MAX_EDIT_IDS,
            )
            .default(
              [],
            ),
      },
    )
    .refine(
      (
        b,
      ) =>
        b
          .add
          .length +
          b
            .remove
            .length >
        0,
      {
        message:
          'Nothing to change',
      },
    );

export const checkQuery =
  z.object(
    {
      handle:
        typedHandle,
    },
  );

export const historyQuery =
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
    },
  );
