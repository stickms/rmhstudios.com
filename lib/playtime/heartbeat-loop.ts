/**
 * The client half of playtime: while a title's page is open, call `send` every
 * 30 s if the tab is visible and the user has touched the page in the last
 * 5 minutes. Timers and clock are injectable so the cadence is testable; the
 * component is a thin shell over this.
 *
 * Nothing is sent on mount (the first beat is one interval in), so a bounce
 * credits nothing. The caller starts a loop only for a signed-in user.
 */

import { HEARTBEAT_INTERVAL_S, shouldBeat } from '@/lib/playtime/credit';

export type HeartbeatLoop = { noteInput(): void; stop(): void };

export function startHeartbeatLoop(deps: {
  gameId: string;
  send: (gameId: string) => void;
  isVisible: () => boolean;
  now: () => number;
}): HeartbeatLoop {
  let lastInputAt = deps.now();
  const timer = setInterval(() => {
    const now = deps.now();
    if (shouldBeat({ visible: deps.isVisible(), signedIn: true, lastInputAt, now })) {
      deps.send(deps.gameId);
    }
  }, HEARTBEAT_INTERVAL_S * 1000);

  return {
    noteInput() {
      lastInputAt = deps.now();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
