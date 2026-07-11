'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe online/offline state driven by the browser `online`/`offline`
 * events. Returns `true` during SSR and the initial client paint (assume
 * connected so we never flash an offline banner on a good connection), then
 * syncs to `navigator.onLine` once mounted.
 *
 * Note: `navigator.onLine === true` only means the device has *a* network
 * interface, not that the internet is reachable — so treat this as "definitely
 * offline" feedback, and still let real requests time out (see
 * `lib/fetch-timeout.ts`) for the "connected but dead-slow" case.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
