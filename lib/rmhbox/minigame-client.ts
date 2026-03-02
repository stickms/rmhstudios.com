/**
 * RMHbox — Shared Minigame Client Utilities
 *
 * Common utilities extracted from individual minigame components to
 * reduce duplication. Every minigame uses these patterns identically.
 *
 * - emitGameInput: sends a game input action via the socket
 * - useGameSocket: subscribes to GAME_ACTION + GAME_STATE_SNAPSHOT events
 * - useGameStateHydration: hydrates local state from Zustand store on mount
 * - extractTimerTick: extracts timeRemaining from a TIMER_TICK action payload
 */

import { useEffect } from 'react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';

/**
 * Emit a game input action with the standard GameInputSchema shape.
 * Reads the current lobbyId from the Zustand store.
 */
export function emitGameInput(action: string, data: unknown = {}): void {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

/**
 * Hook: subscribe to game socket events and hydrate from store on mount.
 *
 * Manages the standard pattern used by every minigame:
 * 1. Subscribes to S2C.GAME_ACTION and S2C.GAME_STATE_SNAPSHOT
 * 2. Optionally subscribes to S2C.GAME_ROUND_RESULTS
 * 3. Hydrates from Zustand gameState snapshot on mount
 *
 * @param handlers.onGameAction - Handler for incremental GAME_ACTION events
 * @param handlers.onStateSnapshot - Handler for full GAME_STATE_SNAPSHOT events
 * @param handlers.onRoundResults - Optional handler for GAME_ROUND_RESULTS events
 */
export function useGameSocket(handlers: {
  onGameAction: (data: Record<string, unknown>) => void;
  onStateSnapshot: (data: Record<string, unknown>) => void;
  onRoundResults?: (data: Record<string, unknown>) => void;
}): void {
  const { onGameAction, onStateSnapshot, onRoundResults } = handlers;

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(S2C.GAME_ACTION, onGameAction);
    socket.on(S2C.GAME_STATE_SNAPSHOT, onStateSnapshot);
    if (onRoundResults) {
      socket.on(S2C.GAME_ROUND_RESULTS, onRoundResults);
    }
    return () => {
      socket.off(S2C.GAME_ACTION, onGameAction);
      socket.off(S2C.GAME_STATE_SNAPSHOT, onStateSnapshot);
      if (onRoundResults) {
        socket.off(S2C.GAME_ROUND_RESULTS, onRoundResults);
      }
    };
  }, [onGameAction, onStateSnapshot, onRoundResults]);

  // Hydrate from the Zustand gameState snapshot on mount.
  // This fixes the race condition where the server broadcasts initial game state
  // before the lazy-loaded component has mounted and subscribed to socket events.
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (snapshot && Object.keys(snapshot).length > 0 && snapshot.phase) {
      onStateSnapshot(snapshot as Record<string, unknown>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Extract the timeRemaining value from a TIMER_TICK action payload.
 * Handles both the wrapped `{ payload: { timeRemaining } }` and
 * flat `{ timeRemaining }` formats sent by the server.
 *
 * @returns The timeRemaining value, or undefined if not found
 */
export function extractTimerTick(data: Record<string, unknown>): number | undefined {
  const pl = data.payload as Record<string, unknown> | undefined;
  const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
  return typeof remaining === 'number' ? remaining : undefined;
}
