'use client';

import { useEffect } from 'react';

/**
 * Sends a presence heartbeat while the tab is visible, so the user shows as
 * "online now". Pings on mount, every 60s, and when the tab regains visibility.
 */
export function usePresenceHeartbeat(isLoggedIn: boolean) {
  useEffect(() => {
    if (!isLoggedIn) return;

    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/presence/heartbeat', { method: 'POST', credentials: 'include' }).catch(() => {});
    };

    ping();
    const interval = setInterval(ping, 60_000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [isLoggedIn]);
}
