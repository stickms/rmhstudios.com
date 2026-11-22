/**
 * Feed controls — the zod input schema for `/api/feed/signal`.
 *
 * Split from `./signals`, which the home feed reaches through
 * `lib/feed/timeline.ts` and so must stay zod-free.
 */
import { z } from 'zod';

import { FEED_SIGNAL_KINDS } from './signals';

export const feedSignalSchema = z.object({
  kind: z.enum(FEED_SIGNAL_KINDS),
  // authorId (cuid) or a hashtag (normalized lowercase, no '#').
  targetId: z.string().trim().min(1).max(64),
});

export type FeedSignalInput = z.infer<typeof feedSignalSchema>;
