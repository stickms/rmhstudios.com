/** Request schemas for /api/messages/scheduled (client-safe types come by `import type`). */
import { z } from 'zod';
import { feedImageUrlSchema, gifUrlSchema } from '@/lib/rmhark-schema';
import {
  ALTS_MISMATCH_ISSUE,
  altsMatchImages,
  messageImageAltsField,
  messageGifAltField,
} from '@/lib/messages/image-alts-schema';

const isoInstant = z.string().datetime();

/**
 * POST: the same fields and bounds as a hand-sent message
 * (`sendToConversationBody`), plus the chat and the instant. Voice notes,
 * polls and checklists are out of scope, so they are not accepted.
 */
export const createScheduledMessageBody = z
  .object({
    chatId: z.string().min(1).max(64),
    content: z.string().max(2000).optional().default(''),
    gifUrl: gifUrlSchema.optional(),
    gifAlt: messageGifAltField,
    imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
    imageAlts: messageImageAltsField,
    sendAt: isoInstant,
  })
  .refine(altsMatchImages, ALTS_MISMATCH_ISSUE)
  .refine((d) => d.content.trim().length > 0 || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0, {
    message: 'Message must have text, an image, or a GIF',
  });

/** PATCH: the text or the time; images and the GIF are fixed once scheduled. */
export const patchScheduledMessageBody = z
  .object({
    content: z.string().max(2000).optional(),
    sendAt: isoInstant.optional(),
  })
  .refine((d) => d.content !== undefined || d.sendAt !== undefined, {
    message: 'Nothing to change',
  });

/** GET: one conversation's rows, or every row of the member's when omitted. */
export const listScheduledMessagesQuery = z.object({
  chatId: z.string().min(1).max(64).optional(),
});
