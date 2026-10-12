'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/components/Providers';
import type { FeedItem } from '@/lib/feed-types';
import { caughtUpBoundary, caughtUpKey, newestSeen } from '@/lib/feed/caught-up';

/**
 * X7 — where to draw "You're all caught up" in the home timeline.
 *
 * Returns the id of the first post from the member's previous visit (the
 * divider goes right before it), or null. The previous visit's marker is read
 * ONCE after mount; the new one is written when the tab is hidden or closed,
 * and only if the feed has moved on — so a session costs at most a couple of
 * localStorage writes and the server is never involved. localStorage can throw
 * or be empty (private windows, blocked storage); every access is guarded and
 * the feed simply renders without a divider.
 */
export function useCaughtUpMarker(items: readonly FeedItem[], enabled: boolean): string | null {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const key = caughtUpKey(userId);
  const [seenThrough, setSeenThrough] = useState<string | null>(null);
  const latest = useRef(items);
  latest.current = items;

  // Read the previous session's marker once per account, after hydration.
  useEffect(() => {
    if (!enabled) return;
    try {
      setSeenThrough(window.localStorage.getItem(key));
    } catch {
      setSeenThrough(null);
    }
  }, [enabled, key]);

  // Persist what this session saw when the member leaves it.
  useEffect(() => {
    if (!enabled) return;
    let written: string | null = null;
    const flush = () => {
      const newest = newestSeen(latest.current);
      if (!newest || newest === written) return;
      try {
        const stored = window.localStorage.getItem(key);
        if (!stored || Date.parse(newest) > Date.parse(stored)) {
          window.localStorage.setItem(key, newest);
        }
        written = newest;
      } catch {
        /* storage unavailable — no divider next time, nothing else lost */
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled, key]);

  return useMemo(
    () => (enabled ? caughtUpBoundary(items, seenThrough) : null),
    [enabled, items, seenThrough],
  );
}
