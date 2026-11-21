import { z } from 'zod';

/** Build comment bodies (s06-14). The create body stays `createCommentSchema` in `lib/user-builds-schema.ts`. */
export const editCommentBody =
  z.object(
    {
      content:
        z
          .string()
          .trim()
          .min(
            1,
            'Comment cannot be empty',
          )
          .max(
            2000,
            'Comment is too long',
          ),
    },
  );

export const hideCommentBody =
  z.object(
    {
      hidden:
        z.boolean(),
    },
  );

export const lockCommentsBody =
  z.object(
    {
      locked:
        z.boolean(),
    },
  );
