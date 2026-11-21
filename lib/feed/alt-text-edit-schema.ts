/** Zod inputs for the post-description endpoints (sprint 05 #16). Server-side only: the contract imports types from here. */
import { z } from 'zod';
import {
  MAX_IMAGE_ALT_LENGTH,
  MAX_RMHARK_IMAGES,
  decodeCursor,
} from '@/lib/feed/alt-text-edit';

/** The whole list, one entry per image; the endpoint checks the length against the post. */
export const editPostAltsBodySchema =
  z.object(
    {
      alts: z
        .array(
          z
            .string()
            .max(
              MAX_IMAGE_ALT_LENGTH,
              `A description must be at most ${MAX_IMAGE_ALT_LENGTH} characters`,
            ),
        )
        .min(
          1,
          'Provide a description for each image',
        )
        .max(
          MAX_RMHARK_IMAGES,
        ),
    },
  );

export const missingAltQuerySchema =
  z.object(
    {
      after:
        z
          .string()
          .max(
            200,
          )
          .refine(
            (
              v,
            ) =>
              decodeCursor(
                v,
              ) !==
              null,
            'Invalid cursor',
          )
          .optional(),
    },
  );
