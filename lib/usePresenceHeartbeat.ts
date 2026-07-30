'use client';

import { useEffect } from 'react';
import { useIdleReady } from '@/hooks/useIdleReady';
import { subscribePulse } from '@/lib/pulse';

/**
 * Keeps the user showing as "online now" while the tab is visible.
 *
 * There is no longer a dedicated heartbeat request: `POST /api/pulse` marks
 * presence on every tick, so this hook only has to hold a pulse subscription
 * open. It subscribes to no sections — it wants the side effect, not the payload
 * — and the pulse's own visibility gating preserves the previous behaviour of not
 * pinging a backgrounded tab.
 *
 * Still ref-counted (the layout mounts the sidebar twice, desktop rail + mobile
 * drawer) and still idle-deferred so the first ping doesn't compete with the feed
 * at hydration.
 */
export function usePresenceHeartbeat(isLoggedIn: boolean) {
  const idleReady = useIdleReady();
  useEffect(() => {
    if (!isLoggedIn || !idleReady) return;
    return subscribePulse([], () => {});
  }, [isLoggedIn, idleReady]);
}
