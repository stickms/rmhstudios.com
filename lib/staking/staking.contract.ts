/** Contract for the coin vault read (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { StakeView } from '@/lib/staking/staking.server';

export const getStakeApi =
  endpoint<{
    res: StakeView & {
      balance: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/staking',
    },
  );
