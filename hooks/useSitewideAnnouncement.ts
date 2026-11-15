import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';
import {
  api,
  apiQuery,
} from '@/lib/contract/client';
import {
  getSitewideAnnouncementApi,
  markSitewideAnnouncementSeenApi,
} from '@/lib/sitewide-announcement.contract';

/** Query key of the summary request, for cache updates after a dismissal. */
export const SITEWIDE_ANNOUNCEMENT_QUERY_KEY =
  apiQuery(
    getSitewideAnnouncementApi,
  ).queryKey;

const STALE_MS =
  5 *
  60_000;

/**
 * The current sitewide announcement (summary only) and whether the signed-in
 * viewer has dismissed it. Shared by the popup and the feed row, so both read
 * one cached request.
 *
 * Preloaded: the request starts in the effect right after hydration commits
 * (and after first paint), not when the browser next goes idle, which on a busy
 * page was seconds later. It never holds anything up: it is off during SSR and
 * hydration, nothing waits on it, and it is one small JSON request beside the
 * page's own. The home page goes further and hands it over with the first feed
 * page (`usePreloadedSitewideAnnouncement`), so there it is never fetched.
 */
export function useSitewideAnnouncement() {
  const [
    hydrated,
    setHydrated,
  ] =
    useState(
      false,
    );
  useEffect(
    () =>
      setHydrated(
        true,
      ),
    [],
  );
  return useQuery(
    {
      ...apiQuery(
        getSitewideAnnouncementApi,
      ),
      enabled:
        hydrated,
      staleTime:
        STALE_MS,
      retry: false,
    },
  );
}

/**
 * Seed the shared query with an answer the server already computed for this
 * viewer (the home page's first feed page carries one). Runs once, in an
 * effect, and only when the cache has nothing fresher, so the popup and the
 * feed row read it with no request of their own. `undefined` (the server did
 * not have it in time) leaves the query to fetch as usual.
 */
export function usePreloadedSitewideAnnouncement(
  state:
    | SitewideAnnouncementResponse
    | undefined,
) {
  const queryClient =
    useQueryClient();
  const applied =
    useRef(
      false,
    );
  useEffect(() => {
    if (
      applied.current ||
      !state
    )
      return;
    applied.current = true;
    const existing =
      queryClient.getQueryState(
        SITEWIDE_ANNOUNCEMENT_QUERY_KEY,
      );
    if (
      existing?.data !==
        undefined &&
      Date.now() -
        existing.dataUpdatedAt <
        STALE_MS
    )
      return;
    queryClient.setQueryData(
      SITEWIDE_ANNOUNCEMENT_QUERY_KEY,
      state,
    );
  }, [
    state,
    queryClient,
  ]);
}

/**
 * The same announcement including its markdown `content`. Only enable this
 * when the popup is actually going to be shown.
 */
export function useSitewideAnnouncementContent(
  enabled: boolean,
) {
  return useQuery(
    {
      ...apiQuery(
        getSitewideAnnouncementApi,
        {
          query:
            {
              full: '1',
            },
        },
      ),
      enabled,
      staleTime:
        STALE_MS,
      retry: false,
    },
  );
}

/** Tell the server the signed-in viewer dismissed the popup. Fire-and-forget; never throws. */
export function markSitewideAnnouncementSeen(
  id: string,
): void {
  void api(
    markSitewideAnnouncementSeenApi,
    {
      body: {
        id,
      },
    },
  ).catch(
    () => {},
  );
}
