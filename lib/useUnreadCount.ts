'use client';

import { useEffect, useState } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';

/**
 * Real-time unread message count, shared across every consumer.
 *
 * The site layout mounts the left sidebar TWICE (a desktop copy and a mobile
 * copy, one CSS-hidden), and MobileNav / the inbox column read this too — so
 * previously a single page held several duplicate `/api/messages/stream`
 * EventSource connections. This is now a ref-counted module singleton: ONE SSE
 * (with the same retry → polling fallback), fanned out to every subscriber.
 * Mirrors the singleton pattern used by useFeedSSE.
 */

let count = 0;
const subscribers = new Set<(n: number) => void>();
let eventSource: EventSource | null = null;
let fallbackInterval: ReturnType<typeof setInterval> | null = null;
let retryCount = 0;
let beforeUnloadBound = false;

function broadcast(n: number) {
  count = n;
  for (const s of subscribers) s(n);
}

function connectSSE() {
  if (eventSource) return;
  eventSource = new EventSource('/api/messages/stream');

  eventSource.addEventListener('unread', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof data.count === 'number') broadcast(data.count);
      retryCount = 0;
    } catch {
      // Ignore parse errors
    }
  });

  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    if (subscribers.size === 0) return;

    retryCount++;
    // After 3 failed SSE attempts, fall back to polling.
    if (retryCount >= 3) {
      startPolling();
    } else {
      const delay = Math.min(retryCount * 2000, 10000);
      setTimeout(() => {
        if (subscribers.size > 0 && !eventSource && !fallbackInterval) connectSSE();
      }, delay);
    }
  };
}

function startPolling() {
  if (fallbackInterval) return;
  const fetchUnread = () => {
    fetch('/api/messages/unread-count')
      .then((res) => res.json())
      .then((data) => broadcast(data.count ?? 0))
      .catch(() => {});
  };
  fetchUnread();
  fallbackInterval = setInterval(fetchUnread, 15_000);
}

function start() {
  if (!beforeUnloadBound) {
    window.addEventListener('beforeunload', stop);
    beforeUnloadBound = true;
  }
  if (!eventSource && !fallbackInterval) connectSSE();
}

function stop() {
  eventSource?.close();
  eventSource = null;
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
  retryCount = 0;
  count = 0;
}

export function useUnreadCount(isLoggedIn: boolean) {
  const [value, setValue] = useState(count);
  // Defer opening the connection until the browser is idle so it doesn't compete
  // with the feed SSE + hydration for sockets and the main thread.
  const idle = useIdleReady();

  useEffect(() => {
    if (!isLoggedIn || !idle) {
      setValue(0);
      return;
    }
    subscribers.add(setValue);
    setValue(count);
    start();
    return () => {
      subscribers.delete(setValue);
      // Tear the shared connection down only when the last consumer unmounts.
      if (subscribers.size === 0) stop();
    };
  }, [isLoggedIn, idle]);

  return isLoggedIn ? value : 0;
}
