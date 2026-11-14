/** The viewer's feed signals as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { getFeedSignalsApi } from '@/lib/feed/signals.contract';
import { contractQuery } from '@/lib/route/route-query';

export const feedSignalsQuery =
  () =>
    contractQuery(
      [
        'feed',
        'signals',
      ],
      getFeedSignalsApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );
