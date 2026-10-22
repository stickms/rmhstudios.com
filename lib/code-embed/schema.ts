/**
 * The zod schema for a runnable post embed (F14), used by the create-post
 * schema in `lib/rmhark-schema.ts`. Split from `./shared`, which every post
 * card's `RunnableEmbed` imports and which must therefore stay zod-free.
 */
import { z } from 'zod';

import { EMBED_FIELD_MAX, EMBED_TOTAL_MAX } from './shared';

export const codeEmbedSchema = z
  .object({
    html: z.string().max(EMBED_FIELD_MAX).default(''),
    css: z.string().max(EMBED_FIELD_MAX).default(''),
    js: z.string().max(EMBED_FIELD_MAX).default(''),
  })
  .refine((e) => e.html.length + e.css.length + e.js.length > 0, { message: 'Snippet is empty' })
  .refine((e) => e.html.length + e.css.length + e.js.length <= EMBED_TOTAL_MAX, {
    message: 'Snippet is too large',
  });

export type CodeEmbed = z.infer<typeof codeEmbedSchema>;
