/** Contract for the RMHTube most-replayed strip (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export const getHeatApi =
  endpoint<{
    query: {
      url: string;
    };
    res: {
      buckets: {
        b: number;
        n: number;
      }[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhtube/heat',
    },
  );
