'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

    return () => {
      cancelled.current = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchCount);
    };
  }, [isLoggedIn, intervalMs, fetchCount]);

  return { count, refresh: fetchCount, setCount };
}
