import { useQuery } from '@tanstack/react-query';
import { useIdleReady } from '@/hooks/useIdleReady';
import { api, apiQuery } from '@/lib/contract/client';
import {
  getSitewideAnnouncementApi,
  markSitewideAnnouncementSeenApi,
} from '@/lib/sitewide-announcement.contract';

/** Query key of the summary request, for cache updates after a dismissal. */
export const SITEWIDE_ANNOUNCEMENT_QUERY_KEY = apiQuery(getSitewideAnnouncementApi).queryKey;

/**
 * The current sitewide announcement (summary only) and whether the signed-in
 * viewer has dismissed it. Shared by the popup and the feed row, so both read
 * one cached request. Deferred until the browser is idle so it never competes
 * with hydration.
 */
export function useSitewideAnnouncement() {
  const idle = useIdleReady();
  return useQuery({
    ...apiQuery(getSitewideAnnouncementApi),
    enabled: idle,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * The same announcement including its markdown `content`. Only enable this
 * when the popup is actually going to be shown.
 */
export function useSitewideAnnouncementContent(enabled: boolean) {
  return useQuery({
    ...apiQuery(getSitewideAnnouncementApi, { query: { full: '1' } }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Tell the server the signed-in viewer dismissed the popup. Fire-and-forget; never throws. */
export function markSitewideAnnouncementSeen(id: string): void {
  void api(markSitewideAnnouncementSeenApi, { body: { id } }).catch(() => {});
}
