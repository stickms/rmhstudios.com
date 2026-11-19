/**
 * The contract of RMH Music's friends' progress (Phase 6, plan 1.5). Client-safe: types come from
 * the zod schemas by `import type`, so this file ships no zod. Beside `social.contract.ts`, outside
 * `lib/rmhmusic`, so a site page could import it without pulling the app's code onto the site sheet.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  friendProgressSchema,
  friendsQuery,
  friendsRes,
} from '@/lib/rmhmusic/learn/social/friends-schema';

export type FriendsProgress =
  z.infer<
    typeof friendsRes
  >;
export type FriendProgress =
  z.infer<
    typeof friendProgressSchema
  >;

/** Mutual follows who share their progress (empty unless the viewer's own friends switch is on). */
export const friendsApi =
  endpoint<{
    query: z.infer<
      typeof friendsQuery
    >;
    res: FriendsProgress;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/friends',
    },
  );
