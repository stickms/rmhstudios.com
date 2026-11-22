import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  followChangedSince,
  invalidateMarginExplore,
  marginExploreKey,
  subscribeFollowChanged,
} from '@/lib/discovery/margin-query';

/**
 * Keeps the margin's "Who to follow" honest: a follow anywhere on the site marks the viewer's cached list
 * stale. The follow sites only announce it (`notifyFollowChanged`), so none of them needs a
 * QueryClientProvider; this is the one place that owns a query client. A follow made while the margin was not
 * mounted (a narrow window) is caught on mount, against when the cached list was fetched.
 */
export function useMarginRefreshOnFollow(viewerId: string | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const updatedAt = queryClient.getQueryState(marginExploreKey(viewerId))?.dataUpdatedAt;
    if (updatedAt && followChangedSince(updatedAt)) {
      void invalidateMarginExplore(queryClient);
    }
    return subscribeFollowChanged(() => {
      void invalidateMarginExplore(queryClient);
    });
  }, [queryClient, viewerId]);
}
