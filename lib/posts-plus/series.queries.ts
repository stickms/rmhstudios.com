/** The signed-in member's series as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { listSeriesApi } from '@/lib/posts-plus/series.contract';
import { contractQuery } from '@/lib/route/route-query';

export const seriesQuery =
  () =>
    contractQuery(
      [
        'series',
        'mine-and-following',
      ],
      listSeriesApi,
      undefined,
      {
        staleTime: 5_000,
      },
    );
