'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shared SSE-based hook for real-time unread message count.
 * Falls back to polling if SSE connection fails.
 */
export function useUnreadCount(isLoggedIn: boolean) {
  const [count, setCount] = useState(0);
  const retryCount = useRef(0);

  useEffect(() => {
    if (!isLoggedIn) {
      setCount(0);
      return;
    }

    let eventSource: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const connectSSE = () => {
      if (cancelled) return;

      eventSource = new EventSource('/api/messages/stream');

      eventSource.addEventListener('unread', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data.count === 'number') {
            setCount(data.count);
          }
          retryCount.current = 0;
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;

        if (cancelled) return;

        retryCount.current++;

        // After 3 failed SSE attempts, fall back to polling
        if (retryCount.current >= 3) {
          startPolling();
        } else {
          // Retry SSE with backoff
          const delay = Math.min(retryCount.current * 2000, 10000);
          setTimeout(connectSSE, delay);
        }
      };
    };

    const startPolling = () => {
      if (cancelled || fallbackInterval) return;

      const fetchUnread = () => {
        fetch('/api/messages/unread-count')
          .then((res) => res.json())
          .then((data) => {
            if (!cancelled) setCount(data.count ?? 0);
          })
          .catch(() => {});
      };

      fetchUnread();
      fallbackInterval = setInterval(fetchUnread, 15_000);
    };

    connectSSE();

    return () => {
      cancelled = true;
      eventSource?.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [isLoggedIn]);

  return count;
}
