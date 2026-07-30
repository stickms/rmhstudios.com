'use client';

import { useEffect, useState } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';
import { pulseSnapshot, requestPulse, setPulseNotifications, subscribePulse } from '@/lib/pulse';

/**
 * Fired (on `window`) when notifications are marked read somewhere in the app so
 * the nav badge can refresh immediately instead of waiting for the next poll.
 * Client-side SPA navigation to /notifications doesn't trigger a focus/visibility
 * event, so without this the badge would linger for up to a full poll interval.
 */
export const NOTIFICATIONS_READ_EVENT = 'notifications:read';

/**
 * The unread notification count for the nav badge.
 *
 * This used to own a 45s interval plus focus/visibility listeners against
 * `/api/notifications/unread-count`. It now reads the `notifications` section of
 * the shared pulse (`lib/pulse.ts`), which carries the presence heartbeat and the
 * friends surfaces in the same request — so the several consumers here (the nav
 * rail, the shell — which mounts twice, desktop rail + mobile drawer — and the
 * inbox column) cost no requests of their own at all.
 *
 * The subscription is still ref-counted and idle-deferred, and the returned
 * `refresh`/`setCount` still fan out to every consumer, so callers are unchanged.
 */
export function useNotificationCount(isLoggedIn: boolean) {
  const [value, setValue] = useState(() => pulseSnapshot().notifications);
  const idleReady = useIdleReady();

  useEffect(() => {
    if (!isLoggedIn) {
      setValue(0);
      return;
    }
    // Defer joining the pulse until the browser is idle so the badge count
    // doesn't contend for the network during hydration/TTI.
    if (!idleReady) return;

    const unsubscribe = subscribePulse(['notifications'], (data) => setValue(data.notifications));
    // A client-side navigation that marks notifications read fires neither focus
    // nor visibilitychange, so it gets its own immediate pulse.
    const onRead = () => void requestPulse();
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => {
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
      unsubscribe();
    };
  }, [isLoggedIn, idleReady]);

  return {
    count: isLoggedIn ? value : 0,
    refresh: requestPulse,
    setCount: setPulseNotifications,
  };
}
