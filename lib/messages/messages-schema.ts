/**
 * Zod schema for POST /api/messages (start or continue a DM). Imported by the
 * ROUTE only; the client reaches the type through `messages.contract.ts`.
 */
import { z } from 'zod';
import { feedImageUrlSchema, gifUrlSchema } from '@/lib/rmhark-schema';

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1),
  content: z.string().max(2000).optional(),
  gifUrl: gifUrlSchema.optional(),
  imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
});
