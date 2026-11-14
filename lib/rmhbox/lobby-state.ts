import type { LobbyState } from './types';

/**
 * The lobby states in which a game is underway — from the host's settings
 * screen through the round results. One list for every client surface (the
 * lobby page's header context, the Discord Activity, the host's Force End
 * control), matching the states the hub's force-end accepts
 * (`server/rmhbox/game-coordinator.ts` onForceEnd).
 */
const IN_GAME_STATES: ReadonlySet<LobbyState> =
  new Set<LobbyState>(
    [
      'GAME_SETTINGS',
      'INSTRUCTIONS',
      'PRELOADING',
      'COUNTDOWN',
      'PLAYING',
      'ROUND_RESULTS',
    ],
  );

export function isInGameLobbyState(
  state: LobbyState,
): boolean {
  return IN_GAME_STATES.has(
    state,
  );
}
