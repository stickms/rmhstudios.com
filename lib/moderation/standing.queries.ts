/** The viewer's account standing as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { accountStandingApi } from '@/lib/moderation/standing.contract';
import { contractQuery } from '@/lib/route/route-query';

export const accountStandingQuery =
  () =>
    contractQuery(
      [
        'account',
        'standing',
      ],
      accountStandingApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );
