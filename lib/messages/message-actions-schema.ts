/**
 * Zod schemas for the per-conversation DM action routes
 * (`/api/messages/$conversationId/{edit,unsend,hide,typing,react}`). Imported by
 * the ROUTES only; the client reaches the types through
 * `message-actions.contract.ts` with `import type`.
 */
import { z } from 'zod';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';
import { feedImageUrlSchema, gifUrlSchema } from '@/lib/rmhark-schema';

export const editMessageBody = z.object({
  messageId: z.string().min(1).max(64),
  content: z.string().max(MESSAGE_MAX_LENGTH),
});

export const unsendMessageBody = z.object({
  messageId: z.string().min(1).max(64),
});

export const hideMessageBody = z.object({
  messageId: z.string().min(1).max(64),
  /** `false` restores it, so an accidental hide is recoverable. */
  hidden: z.boolean().default(true),
});

export const typingBody = z.object({ isTyping: z.boolean() });

export const reactMessageBody = z.object({
  messageId: z.string(),
  emoji: z.string().min(1).max(32),
});

/** GET /api/messages/$conversationId/thread */
export const threadQuery = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/messages/$conversationId/mutations */
export const mutationsQuery = z.object({
  since: z.string().datetime(),
});

/** POST /api/messages/$conversationId — send into an existing conversation. */
export const sendToConversationBody = z
  .object({
    content: z.string().max(2000).optional().default(''),
    gifUrl: gifUrlSchema.optional(),
    imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
  })
  .refine((d) => d.content.trim().length > 0 || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0, {
    message: 'Message must have text, an image, or a GIF',
  });
