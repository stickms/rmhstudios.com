import { useQuery } from '@tanstack/react-query';
import { useIdleReady } from '@/hooks/useIdleReady';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';

export const SITEWIDE_ANNOUNCEMENT_QUERY_KEY = ['sitewide-announcement'] as const;

async function fetchAnnouncement(full: boolean): Promise<SitewideAnnouncementResponse> {
  const res = await fetch(`/api/sitewide-announcement${full ? '?full=1' : ''}`);
  if (!res.ok) throw new Error('Failed to fetch sitewide announcement');
  return res.json();
}

/**
 * The current sitewide announcement (summary only) and whether the signed-in
 * viewer has dismissed it. Shared by the popup and the feed card, so both read
 * one cached request. Deferred until the browser is idle so it never competes
 * with hydration.
 */
export function useSitewideAnnouncement() {
  const idle = useIdleReady();
  return useQuery({
    queryKey: SITEWIDE_ANNOUNCEMENT_QUERY_KEY,
    queryFn: () => fetchAnnouncement(false),
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
    queryKey: [...SITEWIDE_ANNOUNCEMENT_QUERY_KEY, 'full'] as const,
    queryFn: () => fetchAnnouncement(true),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
