/** The theme-vote view as a query (s07-07). */
import { getJamThemeVoteApi } from '@/lib/competitive/jam-themes.contract';
import { contractQuery } from '@/lib/route/route-query';

export const jamThemeVoteQuery =
  (
    slug: string,
  ) =>
    contractQuery(
      [
        'jams',
        'theme-vote',
        slug,
      ],
      getJamThemeVoteApi,
      {
        params:
          {
            slug,
          },
        retries: 0,
      },
      {
        staleTime: 5_000,
      },
    );
