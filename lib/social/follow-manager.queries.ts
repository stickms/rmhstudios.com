/**
 * /follows data as a React Query (redesign audit B4) and the writes the manager
 * makes. Client-safe: contracts only. The list is an infinite query keyed by the
 * URL's tab, filter, search and sort, so changing any of them starts again from
 * the first page and a slow page for an abandoned filter never lands.
 */
import { infiniteQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import { toggleFollowApi } from '@/lib/profile/follow.contract';
import {
  bulkUnfollowApi,
  listFollowsApi,
  removeFollowersApi,
  undoUnfollowApi,
} from '@/lib/social/follow-manager.contract';
import type { FollowQuery } from '@/lib/social/follow-filters';

export const followsQuery = ({ tab, filter, q, sort }: FollowQuery) =>
  infiniteQueryOptions({
    queryKey: ['follows', tab, filter, q, sort] as const,
    queryFn: ({ pageParam, signal }) =>
      api(listFollowsApi, {
        query: { tab, filter, q, sort, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });

export const unfollowAccounts = (followingIds: string[]) =>
  api(bulkUnfollowApi, { body: { followingIds } });

export const removeFollowers = (followerIds: string[]) =>
  api(removeFollowersApi, { body: { followerIds } });

/** Re-follow someone just unfollowed, without a new follow notification to them. */
export const undoUnfollow = (followingId: string) =>
  api(undoUnfollowApi, { body: { followingId } });

export const followBack = (id: string) => api(toggleFollowApi, { params: { id } });
