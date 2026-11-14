/** Request schema for POST /api/comments/$commentId/react. Client-safe. */
import { z } from 'zod';

export const reactBody =
  z.object(
    {
      emoji:
        z
          .string()
          .min(
            1,
          )
          .max(
            32,
          ),
    },
  );
