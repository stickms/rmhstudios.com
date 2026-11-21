/** zod for the community note endpoints (shared by the routes and `member-notes.contract.ts`). */
import { z } from 'zod';
import {
  NOTE_COUNTS_MAX_IDS,
  NOTE_MAX_LENGTH,
  parseIdList,
} from '@/lib/communities/member-notes';

const noteText = z.string().trim().min(1).max(NOTE_MAX_LENGTH);
const id = z.string().min(1).max(64);

export const createNoteBody = z.object({
  body: noteText,
  banId: id.optional(),
  modItemId: id.optional(),
});

export const editNoteBody = z.object({ body: noteText });

/** `?userIds=a,b,c`: one comma-separated parameter, at most 50 ids (the route splits it with `parseIdList`). */
export const noteCountsQuery = z.object({
  userIds: z
    .string()
    .min(1)
    .max(NOTE_COUNTS_MAX_IDS * 70)
    .refine(
      (raw) => {
        const ids = parseIdList(raw);
        return ids.length >= 1 && ids.length <= NOTE_COUNTS_MAX_IDS && ids.every((x) => x.length <= 64);
      },
      { message: `Between 1 and ${NOTE_COUNTS_MAX_IDS} ids` },
    ),
});
