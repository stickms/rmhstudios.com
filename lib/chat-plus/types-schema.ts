/**
 * Messaging extras (P04) — the zod schemas for a chat reference, used by the
 * `.server` route helpers. Split from `./types`, which the conversation view
 * imports and which must stay zod-free.
 */

import { z } from 'zod';

import { CHAT_KINDS } from './types';

export const chatKindSchema = z.enum(CHAT_KINDS);

export const chatRefSchema = z.object({
  kind: chatKindSchema,
  id: z.string().min(1).max(60),
});
export type ChatRef = z.infer<typeof chatRefSchema>;
