/**
 * Zod schemas for RMH Music's social endpoints (Phase 6, `social.contract.ts`). The rules the
 * server applies live in `prefs.server.ts` and `board.server.ts`; the pure ones in `prefs.ts` and
 * `board.ts`.
 */
import { z } from 'zod';

/** The learner's two switches (`GET` and `PUT /api/rmhmusic/social`). */
export const musicSocialRes =
  z.object(
    {
      board:
        z.boolean(),
      friends:
        z.boolean(),
    },
  );

/** Body of `PUT /api/rmhmusic/social`: either switch, at least one. */
export const musicSocialBody =
  z
    .object(
      {
        board:
          z
            .boolean()
            .optional(),
        friends:
          z
            .boolean()
            .optional(),
      },
    )
    .refine(
      (
        b,
      ) =>
        b.board !==
          undefined ||
        b.friends !==
          undefined,
      {
        message:
          'Nothing to change',
      },
    );
