/** Contract for comparing achievements with another member (sprint 04, feature 11). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';
import type { CompareResponse } from '@/lib/achievements/compare';

/**
 * The signed-in caller's achievements beside another member's (`with` is a handle or an id). 404 `{ error }` for an
 * unknown member, a blocked pair in either direction, a banned or deleted member and the caller themselves, all with
 * the same body. The response is private and never cached.
 */
export const compareAchievementsApi =
  endpoint<{
    query: {
      with: string;
    };
    res: CompareResponse;
  }>()(
    {
      method:
        'GET',
      path: '/api/achievements/compare',
    },
  );
