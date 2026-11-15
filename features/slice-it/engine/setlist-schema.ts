/** Client-safe request schemas for /api/slice-it/setlists (shared by the routes and `setlists.contract.ts`). */
import { z } from 'zod';

export const MAX_SETLIST_SONGS = 50;

export const SetlistBodyZ =
  z.object(
    {
      name: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          80,
        ),
      description:
        z
          .string()
          .trim()
          .max(
            300,
          )
          .nullish(),
      isPublic:
        z
          .boolean()
          .optional(),
      songIds:
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
            MAX_SETLIST_SONGS,
          )
          .default(
            [],
          ),
    },
  );

export const SetlistPatchZ =
  z.object(
    {
      name: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          80,
        )
        .optional(),
      description:
        z
          .string()
          .trim()
          .max(
            300,
          )
          .nullish(),
      isPublic:
        z
          .boolean()
          .optional(),
      songIds:
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
            MAX_SETLIST_SONGS,
          )
          .optional(),
    },
  );
