/** Today's daily mutator (mutator, board, the viewer's attempt) as a route-seeded query (redesign audit B4). */
import { getDailyMutatorApi } from '@/lib/arcade/arcade.contract';
import { contractQuery } from '@/lib/route/route-query';

export const dailyMutatorQuery =
  () =>
    contractQuery(
      [
        'arcade',
        'daily',
      ],
      getDailyMutatorApi,
      {
        retries: 0,
      },
      {
        staleTime: 15_000,
      },
    );
