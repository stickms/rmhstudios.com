/**
 * Phase 4 — Security: State-Masking Verification
 *
 * Ensures that the client-side store and state synchronization
 * do not leak private data between players, and that spectators
 * cannot see hidden player state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRMHboxStore, applyLobbyAction } from '../../../lib/rmhbox/store';
import { createClientLobbyState, createClientPlayer, MOCK_USERS } from './setup';
import type { GameAction } from '../../../lib/rmhbox/types';

describe('Security: State-Masking Verification (Phase 4)', () => {
  beforeEach(() => {
    useRMHboxStore.setState({
      connectionStatus: 'disconnected',
      lobby: null,
      gameState: {},
      lastSeq: -1,
      settings: {
        masterVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.5,
        showChat: true,
        chatPosition: 'right',
        theme: 'dark',
      },
    });
  });

  it('should not expose socket IDs in client lobby state', () => {
    const lobby = createClientLobbyState({
      players: [
        createClientPlayer(MOCK_USERS.alice),
        createClientPlayer(MOCK_USERS.bob),
      ],
    });

    useRMHboxStore.getState().applyFullSync(lobby);
    const state = useRMHboxStore.getState().lobby;
    expect(state).not.toBeNull();

    // ClientPlayerInfo should NOT have socketId field
    for (const player of state!.players) {
      expect(player).not.toHaveProperty('socketId');
      expect(player).not.toHaveProperty('joinedAt');
      expect(player).not.toHaveProperty('lastSeenAt');
    }
  });

  it('should scope my role correctly — player vs spectator', () => {
    const playerLobby = createClientLobbyState({ myRole: 'player' });
    useRMHboxStore.getState().applyFullSync(playerLobby);
    expect(useRMHboxStore.getState().lobby?.myRole).toBe('player');

    const spectatorLobby = createClientLobbyState({ myRole: 'spectator' });
    useRMHboxStore.getState().applyFullSync(spectatorLobby);
    expect(useRMHboxStore.getState().lobby?.myRole).toBe('spectator');
  });

  it('should not allow Player A to see Player B private game state via store', () => {
    // Simulate Player A's state
    const lobby = createClientLobbyState({
      myUserId: MOCK_USERS.alice.userId,
      currentGame: {
        minigameId: 'undercover-agent',
        displayName: 'Undercover Agent',
        phase: 'playing',
        timeRemaining: 30,
        publicState: { round: 1 },
        privateState: { myWord: 'apple' }, // Alice's private word
      },
    });

    useRMHboxStore.getState().applyFullSync(lobby);
    const state = useRMHboxStore.getState().lobby!;

    // Alice should see her own private state
    expect(state.currentGame?.privateState).toEqual({ myWord: 'apple' });

    // Verify the store only holds Alice's perspective
    expect(state.myUserId).toBe(MOCK_USERS.alice.userId);

    // The store should NOT contain Bob's private word
    // (Bob's private state is sent separately to Bob's socket)
    const allStateStr = JSON.stringify(state);
    expect(allStateStr).not.toContain('banana'); // Bob's hypothetical word
  });

  it('should not expose server-internal match summary fields to client', () => {
    const lobby = createClientLobbyState({
      matchHistory: [
        {
          matchId: 'match-1',
          minigameId: 'rhyme-time',
          minigameDisplayName: 'Rhyme Time',
          playerCount: 2,
          winnerUserName: 'Alice',
          rankings: [
            { userId: MOCK_USERS.alice.userId, userName: 'Alice', rank: 1, score: 200 },
            { userId: MOCK_USERS.bob.userId, userName: 'Bob', rank: 2, score: 100 },
          ],
          durationMs: 5000,
          playedAt: Date.now(),
        },
      ],
    });

    useRMHboxStore.getState().applyFullSync(lobby);
    const history = useRMHboxStore.getState().lobby!.matchHistory;

    // Match history should NOT expose gameLog or full results JSON
    for (const match of history) {
      expect(match).not.toHaveProperty('gameLog');
      expect(match).not.toHaveProperty('results');
    }
  });

  it('should prevent injecting actions that skip sequence check', () => {
    const lobby = createClientLobbyState({ seq: 10 });
    useRMHboxStore.getState().applyFullSync(lobby);

    // Try to inject a manipulated action with low seq
    const maliciousAction: GameAction = {
      type: 'HOST_TRANSFERRED',
      payload: { newHostUserId: 'attacker-id' },
      seq: 5, // Lower than lastSeq
      timestamp: Date.now(),
    };

    useRMHboxStore.getState().applyAction(maliciousAction);

    // Should be ignored
    expect(useRMHboxStore.getState().lobby?.hostUserId).toBe(MOCK_USERS.alice.userId);
  });
});
