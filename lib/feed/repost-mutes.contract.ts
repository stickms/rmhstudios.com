/** Contracts for /api/feed/repost-mutes (sprint 05 #07). Client-safe: types come from the zod schemas by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { RepostMutePage } from '@/lib/feed/repost-mutes';
import type { repostMuteBodySchema } from '@/lib/feed/repost-mutes-schema';

/**
 * One page of the people whose reposts the caller turned off, newest first. `q` searches name and handle; `target`
 * instead answers "is this person off?" with `targetOff` and no rows. Only the caller's own rows, never cached.
 */
export const listRepostMutesApi = endpoint<{
  query: {
    cursor?: string | undefined;
    q?: string | undefined;
    target?: string | undefined;
  };
  res: RepostMutePage;
}>()({
  method: 'GET',
  path: '/api/feed/repost-mutes',
});

/**
 * Turn reposts from a person off (`off: true`) or back on. 400 for yourself, 404 for an unknown person or one in a
 * block with the caller, 409 past the 1,000-person limit. Idempotent.
 */
export const setRepostMuteApi = endpoint<{
  body: z.infer<typeof repostMuteBodySchema>;
  res: {
    off: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/feed/repost-mutes',
});
