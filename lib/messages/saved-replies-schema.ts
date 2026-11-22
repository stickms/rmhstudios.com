/** Request schemas for /api/saved-replies (client-safe types come by `import type`). */
import { z } from 'zod';
import { BODY_MAX, MAX_SAVED_REPLIES, TITLE_MAX, parseIdList } from '@/lib/messages/saved-replies';

const title = z.string().trim().min(1).max(TITLE_MAX);
const body = z.string().trim().min(1).max(BODY_MAX);

/** POST: a new reply, appended at the end of the member's order. */
export const createSavedReplyBody = z.object({ title, body });

/** PATCH: the title, the body, or both. */
export const patchSavedReplyBody = z
  .object({ title: title.optional(), body: body.optional() })
  .refine((d) => d.title !== undefined || d.body !== undefined, { message: 'Nothing to change' });

/** PUT: the new order, as one comma-separated list of ids (repeated parameters do not survive). */
export const reorderSavedRepliesBody = z.object({
  ids: z
    .string()
    .max(MAX_SAVED_REPLIES * 40)
    .refine((v) => parseIdList(v) !== null),
});
