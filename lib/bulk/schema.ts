/**
 * Bulk content management — the zod schema that validates a filter off the
 * wire (plan I2). Split from `./types`, which the /trash page imports for the
 * vocabulary, so it stays zod-free. What each field MEANS is `buildWhere` in
 * `./types`; this only decides what is well-formed.
 */
import { z } from 'zod';

import { MAX_OLDER_THAN_DAYS } from './types';

export const bulkFilterSchema = z
  .object({
    /** Only rows older than N days. */
    olderThanDays: z.number().int().min(0).max(MAX_OLDER_THAN_DAYS).optional(),
    /** Only rows created strictly before this instant. */
    before: z.string().datetime().optional(),
    /** Posts/comments with at most this many likes. */
    maxLikes: z.number().int().min(0).max(1_000_000).optional(),
    /** Replies only — see `buildPostWhere` / `buildCommentWhere` for what that means. */
    onlyReplies: z.boolean().optional(),
    /** Posts carrying this hashtag (without the `#`). */
    tag: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[\p{L}\p{N}_]+$/u)
      .optional(),
  })
  .strict();

export type BulkFilter = z.infer<typeof bulkFilterSchema>;
