/** Input schemas for the conversation controls (mute a post's conversation, pin a reply). zod lives here, not in the contract. */
import { z } from 'zod';
import { MUTE_CHOICES } from '@/lib/feed/conversation-controls';

export const muteConversationBody = z.object({
  choice: z.enum(MUTE_CHOICES),
});

export const pinReplyBody = z.object({
  commentId: z.string().min(1).max(64),
});

export const mutedConversationsQuery = z.object({
  cursor: z.string().max(80).optional(),
});
