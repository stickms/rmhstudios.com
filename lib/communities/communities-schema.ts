/** Client-safe request schemas for /api/communities (shared by the routes and `communities.contract.ts`). */
import { z } from 'zod';

export const createCommunityBody =
  z.object(
    {
      name: z
        .string()
        .min(
          2,
        )
        .max(
          60,
        ),
      description:
        z
          .string()
          .max(
            500,
          )
          .optional(),
      icon: z
        .string()
        .max(
          8,
        )
        .optional(),
      color:
        z
          .string()
          .max(
            16,
          )
          .optional(),
      isPrivate:
        z
          .boolean()
          .optional(),
    },
  );

export const createAnnouncementBody =
  z.object(
    {
      body: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          2000,
        ),
    },
  );

export const joinCommunityBody =
  z.object(
    {
      invite:
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
