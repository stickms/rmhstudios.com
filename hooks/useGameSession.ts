'use client';

import { useEffect, useRef } from 'react';
import { requestScreenWakeLock } from '@/lib/shared/platform';
import { useShortcuts } from '@/lib/shortcuts/useShortcuts';

/**
 * The game session contract (plan U3) — what every console does and most of
 * our games did not:
 *
 *  - **Pause when the player looks away.** Switching tabs, locking the phone or
 *    swiping to another app calls `onPause` once. Games resume behind their own
 *    "continue" UI, never automatically: coming back to a game that is already
 *    moving is how runs end without the player touching anything.
 *  - **Keep the screen on** while a run is live (Wake Lock; released the moment
 *    `active` goes false, re-acquired after the tab returns).
 *  - **One restart binding.** `R` (outside text fields) calls `onRestart`, and
 *    it is published to the shortcut registry so the help sheet lists it.
 *
 * Cost: two document listeners and a wake-lock sentinel while mounted. No
 * state, no renders, nothing per frame. Callbacks are read through refs, so an
 * inline arrow never re-subscribes anything.
 *
 * Multiplayer runs cannot pause; pass `onPause` only when the game is in a
 * single-player run (or omit it) and still get the wake lock and restart.
 */
export interface GameSessionOptions {
  /** Catalog id (`lib/catalog/games/<id>.ts`) — scopes the shortcut. */
  id: string;
  /** True while a run is in progress (not on menus or results). */
  active: boolean;
  /** Called once when the page is hidden during an active run. */
  onPause?: () => void;
  /** Bound to `R`. Omit when the game already binds its own restart key. */
  onRestart?: () => void;
  /** Restart is live only while this returns true (default: always). */
  canRestart?: () => boolean;
  /** Set false for games that must not hold the screen on (default true). */
  wakeLock?: boolean;
}

export function useGameSession({
  id,
  active,
  onPause,
  onRestart,
  canRestart,
  wakeLock = true,
}: GameSessionOptions): void {
  const pauseRef = useRef(onPause);
  pauseRef.current = onPause;
  const restartRef = useRef(onRestart);
  restartRef.current = onRestart;
  const canRestartRef = useRef(canRestart);
  canRestartRef.current = canRestart;

  // Pause on hide. `pagehide` covers bfcache/navigation on iOS, where
  // `visibilitychange` is not always delivered before the page freezes.
  useEffect(() => {
    if (!active) return;
    const hide = () => {
      if (document.visibilityState === 'hidden') pauseRef.current?.();
    };
    const pagehide = () => pauseRef.current?.();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pagehide);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !wakeLock) return;
    return requestScreenWakeLock();
  }, [active, wakeLock]);

  useShortcuts(
    onRestart
      ? [
          {
            id: `${id}.restart`,
            keys: ['r'],
            scope: `game:${id}`,
            labelKey: 'shortcut-restart',
            label: 'Restart',
            ns: 'c-game',
            when: () => canRestartRef.current?.() ?? true,
            run: () => restartRef.current?.(),
          },
        ]
      : [],
  );
}
