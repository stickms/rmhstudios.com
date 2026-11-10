/** Contracts for the feed-signal settings surface (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedSignalsView } from '@/lib/feed/signals';
import type { feedSignalSchema } from '@/lib/feed/signals-schema';

export const getFeedSignalsApi = endpoint<{ res: FeedSignalsView }>()({
  method: 'GET',
  path: '/api/feed/signal',
});

export const addFeedSignalApi = endpoint<{
  body: z.infer<typeof feedSignalSchema>;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/feed/signal' });

export const removeFeedSignalApi = endpoint<{
  body: z.infer<typeof feedSignalSchema>;
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/feed/signal' });
