// =============================================================================
// ALTAIR MULTIPLAYER -- Input Protocol
// =============================================================================
// Handles encoding and sending player input at 20Hz to the server.
// =============================================================================

import type { PlayerInputPacket } from './types';

const INPUT_SEND_RATE = 1000 / 20; // 20Hz = 50ms

/**
 * Creates an input sender that collects local input and emits packets at 20Hz.
 */
export function createInputSender(
  emitFn: (packet: PlayerInputPacket) => void,
): {
  update: (dx: number, dy: number) => void;
  start: () => void;
  stop: () => void;
} {
  let seq = 0;
  let tick = 0;
  let currentDx = 0;
  let currentDy = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function sendPacket(): void {
    // Only send if there's actual input (or periodically for keepalive)
    const packet: PlayerInputPacket = {
      seq: ++seq,
      tick: tick++,
      dx: currentDx,
      dy: currentDy,
      timestamp: Date.now(),
    };
    emitFn(packet);
  }

  return {
    update(dx: number, dy: number) {
      currentDx = dx;
      currentDy = dy;
    },
    start() {
      if (intervalId) return;
      seq = 0;
      tick = 0;
      intervalId = setInterval(sendPacket, INPUT_SEND_RATE);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
