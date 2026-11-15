/**
 * The React Query entry behind the shell margin's "Trending" and "Who to follow" lists
 * (`components/shell/MarginLists.tsx`). Client-safe.
 *
 * The list is per viewer (it leaves out the accounts they follow), so the key carries who is looking:
 * one cache entry is never read by a different account or by a signed-out visitor. And it goes stale
 * the moment the viewer follows someone; without that a person just followed stays in the list until
 * `staleTime` runs out.
 *
 * A follow site (profile page, hover card, social list, Explore) must not need a QueryClientProvider to
 * say so: some render without one, in tests and in an island. They call {@link notifyFollowChanged} and
 * the margin, which owns a query client, hears it ({@link subscribeFollowChanged}) and invalidates. A
 * margin that is not mounted when the follow happens (a narrow window) checks {@link followChangedSince}
 * against its cached data when it mounts.
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

const listeners =
  new Set<
    () => void
  >();
let lastFollowAt =
  0;

/** Call after a follow or unfollow the server accepted. Needs no provider and no subscriber. */
export function notifyFollowChanged() {
  lastFollowAt =
    Date.now();
  for (const listener of [
    ...listeners,
  ]) {
    listener();
  }
}

/** Hear every follow from now on; returns the unsubscribe. */
export function subscribeFollowChanged(
  listener: () => void,
) {
  listeners.add(
    listener,
  );
  return () => {
    listeners.delete(
      listener,
    );
  };
}

/** Whether a follow happened after `timestamp` (ms), e.g. after a cache entry was fetched. */
export function followChangedSince(
  timestamp: number,
) {
  return (
    lastFollowAt >
    timestamp
  );
}
