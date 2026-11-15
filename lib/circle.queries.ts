/** The close-friends circle as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { getCircleApi } from '@/lib/circle.contract';
import { contractQuery } from '@/lib/route/route-query';

export const circleQuery =
  () =>
    contractQuery(
      [
        'circle',
      ],
      getCircleApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );
