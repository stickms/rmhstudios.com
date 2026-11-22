import { z } from 'zod';
import { folderParam } from '@/lib/study/folders-schema';

/** `?after=` — the cursor a queue response returned, opaque to the client. */
export const reviewQueueQuery = z.object({
  after: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  /** `?folder=` — review only this folder's decks (404 when it is not the member's). */
  folder: folderParam.optional(),
  /** `?tz=` — the member's IANA zone, for the day a paced deck's new cards are counted in (UTC when unknown). */
  tz: z.string().min(1).max(64).optional(),
});

export const suspendCardBody = z.object({
  suspended: z.boolean(),
});
