/** The wallet balance as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { contractQuery } from '@/lib/route/route-query';
import { coinBalanceApi } from '@/lib/site-reads.contract';

export const walletBalanceQuery =
  () =>
    contractQuery(
      [
        'economy-plus',
        'balance',
      ],
      coinBalanceApi,
      {
        retries: 0,
      },
      {
        staleTime: 15_000,
      },
    );
