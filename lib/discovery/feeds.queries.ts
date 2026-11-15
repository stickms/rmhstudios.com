/** The member's custom feeds as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { listFeedsApi } from '@/lib/discovery/discovery.contract';
import { contractQuery } from '@/lib/route/route-query';

export const feedsQuery =
  () =>
    contractQuery(
      [
        'feeds',
        'mine',
      ],
      listFeedsApi,
      undefined,
      {
        staleTime: 5_000,
      },
    );
