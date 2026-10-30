'use client';

/**
 * Credits playtime for the catalog title the user has open. Mounted once next
 * to RecentsTracker (in Providers) and driven by the same path matcher, so the
 * two never disagree about which title a page is. Renders nothing.
 *
 * The cadence lives in `lib/playtime/heartbeat-loop.ts`; the server decides what
 * a beat is worth, so nothing here can inflate hours.
 */

import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { matchCatalogRoute } from '@/lib/games/route-match';
import { startHeartbeatLoop } from '@/lib/playtime/heartbeat-loop';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;

function sendBeat(gameId: string) {
  void fetch('/api/games/playtime', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameId }),
    keepalive: true,
  }).catch(() => {});
}

export function PlaytimeTracker() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const gameId = pathname ? (matchCatalogRoute(pathname)?.id ?? null) : null;

  useEffect(() => {
    if (!signedIn || !gameId) return;
    const loop = startHeartbeatLoop({
      gameId,
      send: sendBeat,
      isVisible: () => document.visibilityState === 'visible',
      now: () => Date.now(),
    });
    // Input handlers fire constantly (pointermove); one write per second is plenty.
    let last = 0;
    const onInput = () => {
      const t = Date.now();
      if (t - last < 1000) return;
      last = t;
      loop.noteInput();
    };
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    return () => {
      loop.stop();
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
    };
  }, [signedIn, gameId]);

  return null;
}
