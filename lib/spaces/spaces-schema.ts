import { z } from 'zod';
import {
  SPACE_PINNED_KINDS,
  SPACE_PIN_REF_MAX,
} from '@/lib/spaces/types';

const pinnedSchema =
  z
    .object(
      {
        kind: z.enum(
          SPACE_PINNED_KINDS,
        ),
        ref: z
          .string()
          .min(
            1,
          )
          .max(
            SPACE_PIN_REF_MAX,
          ),
      },
    )
    .optional();

/** Body of POST /api/spaces. */
export const createSpaceBody =
  z.object(
    {
      title:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            120,
          ),
      communityId:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          )
          .optional(),
      scheduledAt:
        z
          .string()
          .datetime()
          .optional(),
      recordChat:
        z
          .boolean()
          .optional(),
      pinned:
        pinnedSchema,
    },
  );
