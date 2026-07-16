'use client';

import { useEffect } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';

/**
 * Sends a presence heartbeat while the tab is visible, so the user shows as
 * "online now". Pings on mount, every 60s, and when the tab regains visibility.
 *
 * Ref-counted module singleton: the site layout mounts the left sidebar twice
 * (desktop rail + mobile drawer) and both call this — so without sharing, the
 * client sent duplicate heartbeats. One shared interval/listener regardless of
 * how many consumers mount.
 */

let subscribers = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let visListener: (() => void) | null = null;

function ping() {
  if (document.visibilityState !== 'visible') return;
  fetch('/api/presence/heartbeat', { method: 'POST', credentials: 'include' }).catch(() => {});
}

function start() {
  if (interval) return;
  ping();
  interval = setInterval(ping, 60_000);
  visListener = ping;
  document.addEventListener('visibilitychange', visListener);
}

function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (visListener) {
    document.removeEventListener('visibilitychange', visListener);
    visListener = null;
  }
}

export function usePresenceHeartbeat(isLoggedIn: boolean) {
  const idleReady = useIdleReady();
  useEffect(() => {
    // Defer the first heartbeat until idle so it doesn't compete with the feed
    // at hydration; the 60s interval + visibility ping behave as before.
    if (!isLoggedIn || !idleReady) return;
    subscribers++;
    start();
    return () => {
      subscribers--;
      if (subscribers <= 0) {
        subscribers = 0;
        stop();
      }
    };
  }, [isLoggedIn, idleReady]);
}
