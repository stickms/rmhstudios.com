'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Fired (on `window`) when notifications are marked read somewhere in the app so
 * the nav badge can refresh immediately instead of waiting for the next poll.
 * Client-side SPA navigation to /notifications doesn't trigger a focus/visibility
 * event, so without this the badge would linger for up to a full poll interval.
 */
export const NOTIFICATIONS_READ_EVENT = 'notifications:read';

/**
 * Polls the unread notification count. Refreshes on an interval and whenever the
 * tab regains focus/visibility so the badge stays roughly live without holding a
 * persistent connection. Returns the count plus a `refresh` to force an update
 * (e.g. right after the user opens the notification center).
 */
export function useNotificationCount(isLoggedIn: boolean, intervalMs = 45_000) {
  const [count, setCount] = useState(0);
  const cancelled = useRef(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled.current && typeof data.count === 'number') setCount(data.count);
    } catch {
      // Network hiccup — keep the last known value.
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (!isLoggedIn) {
      setCount(0);
      return;
    }

    fetchCount();
    const interval = setInterval(fetchCount, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchCount);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, fetchCount);

    return () => {
      cancelled.current = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchCount);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, fetchCount);
    };
  }, [isLoggedIn, intervalMs, fetchCount]);

  return { count, refresh: fetchCount, setCount };
}
