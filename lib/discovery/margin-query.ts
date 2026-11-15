/**
 * The React Query entry behind the shell margin's "Trending" and "Who to follow" lists
 * (`components/shell/MarginLists.tsx`). Client-safe.
 *
 * The list is per viewer (it leaves out the accounts they follow), so the key carries who is looking:
 * one cache entry is never read by a different account or by a signed-out visitor. And it goes stale
 * the moment the viewer follows someone, so every follow action calls {@link invalidateMarginExplore};
 * without that a person just followed stays in the list until `staleTime` runs out.
 */
import type { QueryClient } from '@tanstack/react-query';

const ROOT =
  'shell-margin-explore';

export function marginExploreKey(
  viewerId:
    | string
    | null
    | undefined,
) {
  return [
    ROOT,
    viewerId ??
      'anon',
  ] as const;
}

/** Mark every viewer's margin list stale; a mounted margin refetches, an unmounted one on its next mount. */
export function invalidateMarginExplore(
  queryClient: QueryClient,
) {
  return queryClient.invalidateQueries(
    {
      queryKey:
        [
          ROOT,
        ],
    },
  );
}
