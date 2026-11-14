/**
 * The wager list and one match as route-seeded queries (redesign audit B4). The "open"
 * tab is public; "mine" needs a session and is only fetched by the client.
 */
import { contractQuery } from '@/lib/route/route-query';
import {
  getWagerApi,
  listWagersApi,
} from '@/lib/wager/wager.contract';

export type WagerFilter =
  | 'open'
  | 'mine';

export const wagersQuery =
  (
    filter: WagerFilter,
  ) =>
    contractQuery(
      [
        'wager',
        'list',
        filter,
      ],
      listWagersApi,
      {
        query:
          {
            filter,
          },
      },
      {
        staleTime: 5_000,
      },
    );

/** An unknown match fails the fetch (404), which the page shows as "no longer exists". */
export const wagerQuery =
  (
    id: string,
  ) =>
    contractQuery(
      [
        'wager',
        'detail',
        id,
      ],
      getWagerApi,
      {
        params:
          {
            id,
          },
      },
      {
        staleTime: 5_000,
      },
    );
