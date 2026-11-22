/**
 * Contracts for ending and extending your own poll (sprint 04 #08).
 * Client-safe: types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PollLifecycleView } from '@/lib/feed/poll-lifecycle';
import type { extendPollSchema } from '@/lib/feed/poll-lifecycle-schema';

type ExtendPollBody = z.infer<typeof extendPollSchema>;

export const endPollApi = endpoint<{
  res: PollLifecycleView;
}>()({
  method: 'POST',
  path: '/api/rmharks/$id/poll/end',
});

export const extendPollApi = endpoint<{
  body: ExtendPollBody;
  res: PollLifecycleView;
}>()({
  method: 'POST',
  path: '/api/rmharks/$id/poll/extend',
});
