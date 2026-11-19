/** A list's first timeline page as a route-seeded query (redesign audit B4). Later pages are "load more", client-owned. */
import { getUserListsApi, listFeedApi } from '@/lib/lists/lists.contract';
import { contractQuery } from '@/lib/route/route-query';

/** No visible list, no feed: the route answers 404 and nothing is seeded. */
export const listFeedQuery =
  (
    id: string,
  ) =>
    contractQuery(
      [
        'lists',
        'feed',
        id,
      ],
      listFeedApi,
      {
        params:
          {
            id,
          },
      },
      {
        staleTime: 15_000,
      },
    );

/** The caller's lists, for the Lists tab of /feeds. Signed out: nothing is seeded. */
export const userListsQuery = () =>
  contractQuery(['lists', 'mine'], getUserListsApi, { query: {} }, { staleTime: 5_000 });
