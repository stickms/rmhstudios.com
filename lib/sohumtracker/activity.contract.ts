/** Contract for the Sohum tracker's manual refresh (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { WatchStateDTO } from '@/lib/sohumtracker/types';

export const getWatchActivityApi =
  endpoint<{
    query: {
      days: number;
    };
    res: WatchStateDTO;
  }>()(
    {
      method:
        'GET',
      path: '/api/sohumtracker/activity',
    },
  );
