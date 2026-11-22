import { z } from 'zod';
import { folderParam } from '@/lib/study/folders-schema';

/** `?after=` — the cursor a queue response returned, opaque to the client. */
export const reviewQueueQuery =
  z.object(
    {
      after:
        z
          .string()
          .max(
            64,
          )
          .regex(
            /^[A-Za-z0-9_-]+$/,
          )
          .optional(),
      /** `?folder=` — review only this folder's decks (404 when it is not the member's). */
      folder:
        folderParam.optional(),
    },
  );

export const suspendCardBody =
  z.object(
    {
      suspended:
        z.boolean(),
    },
  );
