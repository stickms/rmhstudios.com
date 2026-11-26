/** The viewer's theme suggestions for a jam as a query (s15-13). */
import { getJamSuggestionsApi } from '@/lib/competitive/jam-suggestions.contract';
import { contractQuery } from '@/lib/route/route-query';

export const jamSuggestionsQuery = (slug: string, enabled = true) =>
  contractQuery(
    ['jams', 'suggestions', slug],
    getJamSuggestionsApi,
    {
      params: {
        slug,
      },
      retries: 0,
    },
    {
      staleTime: 5_000,
      enabled,
    },
  );
