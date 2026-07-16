'use client';

import { useEffect, useState } from 'react';

/**
 * Fired (on `window`) when notifications are marked read somewhere in the app so
 * the nav badge can refresh immediately instead of waiting for the next poll.
 * Client-side SPA navigation to /notifications doesn't trigger a focus/visibility
 * event, so without this the badge would linger for up to a full poll interval.
 */
export const NOTIFICATIONS_READ_EVENT = 'notifications:read';

/**
 * Polls the unread notification count (interval + focus/visibility + the
 * read-event above). Ref-counted module singleton so the several consumers (the
 * left sidebar — which the layout mounts twice, desktop rail + mobile drawer —
 * plus the inbox column) share ONE poll/interval instead of each running their
 * own. Returns the shared count plus `refresh`/`setCount` that fan out to all.
 */

let count = 0;
const subscribers = new Set<(n: number) => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;

function broadcast(n: number) {
  count = n;
  for (const s of subscribers) s(n);
}

async function fetchCount() {
  try {
    const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (typeof data.count === 'number') broadcast(data.count);
  } catch {
    // Network hiccup — keep the last known value.
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') fetchCount();
}

function start(intervalMs: number) {
  if (interval) return;
  fetchCount();
  interval = setInterval(fetchCount, intervalMs);
  if (!listenersBound) {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchCount);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, fetchCount);
    listenersBound = true;
  }
}

function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (listenersBound) {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', fetchCount);
    window.removeEventListener(NOTIFICATIONS_READ_EVENT, fetchCount);
    listenersBound = false;
  }
  count = 0;
}

export function useNotificationCount(isLoggedIn: boolean, intervalMs = 45_000) {
  const [value, setValue] = useState(count);

  useEffect(() => {
    if (!isLoggedIn) {
      setValue(0);
      return;
    }
    subscribers.add(setValue);
    setValue(count);
    start(intervalMs);
    return () => {
      subscribers.delete(setValue);
      if (subscribers.size === 0) stop();
    };
  }, [isLoggedIn, intervalMs]);

  return { count: isLoggedIn ? value : 0, refresh: fetchCount, setCount: broadcast };
}
