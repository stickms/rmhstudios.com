'use client';

import { useEffect } from 'react';
import { HISTORY_BEAT_INTERVAL_MS, type HistoryEntityType } from '@/lib/history/constants';

/**
 * useHistoryBeat (§5) — reports a throttled "still here" heartbeat for the
 * given media/content so it appears in History and can be resumed. Sends on
 * mount, every ~15s while `active`, on tab-hide (via sendBeacon), and once on
 * unmount. No-ops for signed-out users server-side (the endpoint 401s quietly)
 * and when `entityId` is missing.
 *
 * ```tsx
 * useHistoryBeat('tube_video', videoId, {
 *   getPosition: () => player.currentTime,
 *   getDuration: () => player.duration,
 *   active: playing,
 * });
 * ```
 */
export function useHistoryBeat(
  entityType: HistoryEntityType,
  entityId: string | null | undefined,
  opts: {
    getPosition?: () => number | undefined;
    getDuration?: () => number | undefined;
    active?: boolean;
  } = {},
) {
  const { getPosition, getDuration, active = true } = opts;

  useEffect(() => {
    if (!entityId || !active) return;

    const send = (useBeacon = false) => {
      const body = JSON.stringify({
        entityType,
        entityId,
        position: getPosition?.(),
        duration: getDuration?.(),
      });
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/history/beat', new Blob([body], { type: 'application/json' }));
      } else {
        void fetch('/api/history/beat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };

    send();
    const iv = setInterval(() => send(), HISTORY_BEAT_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisibility);
      send(true);
    };
    // getPosition/getDuration are read lazily; re-subscribe only on identity/active change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, active]);
}
