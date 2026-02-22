/**
 * Phase 4 §4 — Client-Side Store Tests
 *
 * Verifies the Zustand store correctly:
 * - Applies actions with sequence ordering
 * - Applies full sync (replaces state)
 * - Handles all lobby action types via reducers
 * - Persists settings to localStorage
 * - Rejects out-of-order actions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRMHboxStore, applyLobbyAction, applyGameAction } from '../../../lib/rmhbox/store';
import { createClientLobbyState, createClientPlayer, MOCK_USERS, createChatMessage } from './setup';
import type { GameAction } from '../../../lib/rmhbox/types';

describe('Client-Side Store (§4)', () => {
  beforeEach(() => {
    // Reset store to initial state
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
      },
    });
  });

  // ─── Connection Status ───────────────────────────────────────

  it('should set connection status', () => {
    const store = useRMHboxStore.getState();
    store.setConnectionStatus('connected');
    expect(useRMHboxStore.getState().connectionStatus).toBe('connected');
  });

  it('should cycle through all connection statuses', () => {
    const store = useRMHboxStore.getState();
    const statuses: Array<'disconnected' | 'connecting' | 'connected' | 'error'> = [
      'connecting', 'connected', 'error', 'disconnected',
    ];
    for (const status of statuses) {
      store.setConnectionStatus(status);
      expect(useRMHboxStore.getState().connectionStatus).toBe(status);
    }
  });

  // ─── Full Sync ───────────────────────────────────────────────

  it('should apply full sync (replace lobby state)', () => {
    const fullState = createClientLobbyState({ seq: 5 });
    useRMHboxStore.getState().applyFullSync(fullState);

    const state = useRMHboxStore.getState();
    expect(state.lobby).toEqual(fullState);
    expect(state.lastSeq).toBe(5);
  });

  it('should replace existing lobby on full sync', () => {
    const initial = createClientLobbyState({ seq: 3, lobbyId: 'OLD01' });
    useRMHboxStore.getState().applyFullSync(initial);

    const updated = createClientLobbyState({ seq: 10, lobbyId: 'NEW01' });
    useRMHboxStore.getState().applyFullSync(updated);

    expect(useRMHboxStore.getState().lobby?.lobbyId).toBe('NEW01');
    expect(useRMHboxStore.getState().lastSeq).toBe(10);
  });

  // ─── Action Sequence Ordering ────────────────────────────────

  it('should apply action with seq > lastSeq', () => {
    const lobby = createClientLobbyState({ seq: 0 });
    useRMHboxStore.getState().applyFullSync(lobby);

    const action: GameAction = {
      type: 'PLAYER_READY_CHANGED',
      payload: { userId: MOCK_USERS.alice.userId, isReady: true },
      seq: 1,
      timestamp: Date.now(),
    };

    useRMHboxStore.getState().applyAction(action);
    expect(useRMHboxStore.getState().lastSeq).toBe(1);
  });

  it('should skip action with seq <= lastSeq (out-of-order)', () => {
    const lobby = createClientLobbyState({ seq: 5 });
    useRMHboxStore.getState().applyFullSync(lobby);

    const action: GameAction = {
      type: 'PLAYER_READY_CHANGED',
      payload: { userId: MOCK_USERS.alice.userId, isReady: true },
      seq: 3, // Out of order
      timestamp: Date.now(),
    };

    useRMHboxStore.getState().applyAction(action);
    expect(useRMHboxStore.getState().lastSeq).toBe(5); // unchanged
  });

  it('should skip action with seq equal to lastSeq (duplicate)', () => {
    const lobby = createClientLobbyState({ seq: 5 });
    useRMHboxStore.getState().applyFullSync(lobby);

    const action: GameAction = {
      type: 'PLAYER_READY_CHANGED',
      payload: { userId: MOCK_USERS.alice.userId, isReady: true },
      seq: 5, // Duplicate
      timestamp: Date.now(),
    };

    useRMHboxStore.getState().applyAction(action);
    expect(useRMHboxStore.getState().lastSeq).toBe(5);
  });

  // ─── Settings ────────────────────────────────────────────────

  it('should update settings partially', () => {
    useRMHboxStore.getState().updateSettings({ masterVolume: 0.3 });
    const settings = useRMHboxStore.getState().settings;
    expect(settings.masterVolume).toBe(0.3);
    expect(settings.sfxVolume).toBe(0.8); // unchanged
  });

  it('should update multiple settings at once', () => {
    useRMHboxStore.getState().updateSettings({ musicVolume: 0.1, showChat: false });
    const settings = useRMHboxStore.getState().settings;
    expect(settings.musicVolume).toBe(0.1);
    expect(settings.showChat).toBe(false);
  });

  // ─── Reset ───────────────────────────────────────────────────

  it('should reset store to initial state', () => {
    useRMHboxStore.getState().applyFullSync(createClientLobbyState({ seq: 10 }));
    useRMHboxStore.getState().setConnectionStatus('connected');

    useRMHboxStore.getState().reset();

    const state = useRMHboxStore.getState();
    expect(state.connectionStatus).toBe('disconnected');
    expect(state.lobby).toBeNull();
    expect(state.gameState).toEqual({});
    expect(state.lastSeq).toBe(-1);
    // Settings should persist (not reset)
    expect(state.settings.masterVolume).toBe(0.7);
  });

  // ─── Game State ──────────────────────────────────────────────

  it('should set game state directly', () => {
    useRMHboxStore.getState().setGameState({ round: 1, scores: [100, 200] });
    expect(useRMHboxStore.getState().gameState).toEqual({ round: 1, scores: [100, 200] });
  });
});

// ─── Lobby Action Reducer Tests ─────────────────────────────────

describe('Lobby Action Reducer (§4.2)', () => {
  it('should handle PLAYER_JOINED', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'PLAYER_JOINED',
      payload: { userId: MOCK_USERS.bob.userId, userName: 'Bob', avatarUrl: 'https://example.com/bob.png' },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.players).toHaveLength(2);
    expect(result.players[1].userId).toBe(MOCK_USERS.bob.userId);
    expect(result.players[1].isReady).toBe(false);
  });

  it('should handle PLAYER_LEFT', () => {
    const lobby = createClientLobbyState({
      players: [
        createClientPlayer(MOCK_USERS.alice, { isHost: true }),
        createClientPlayer(MOCK_USERS.bob),
      ],
    });
    const result = applyLobbyAction(lobby, {
      type: 'PLAYER_LEFT',
      payload: { userId: MOCK_USERS.bob.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.players).toHaveLength(1);
    expect(result.players[0].userId).toBe(MOCK_USERS.alice.userId);
  });

  it('should handle PLAYER_KICKED', () => {
    const lobby = createClientLobbyState({
      players: [
        createClientPlayer(MOCK_USERS.alice, { isHost: true }),
        createClientPlayer(MOCK_USERS.bob),
      ],
    });
    const result = applyLobbyAction(lobby, {
      type: 'PLAYER_KICKED',
      payload: { userId: MOCK_USERS.bob.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.players).toHaveLength(1);
  });

  it('should handle SPECTATOR_JOINED', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'SPECTATOR_JOINED',
      payload: { userId: MOCK_USERS.bob.userId, userName: 'Bob', avatarUrl: null },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.spectators).toHaveLength(1);
    expect(result.spectators[0].userId).toBe(MOCK_USERS.bob.userId);
  });

  it('should handle SPECTATOR_LEFT', () => {
    const lobby = createClientLobbyState({
      spectators: [{ userId: MOCK_USERS.bob.userId, userName: 'Bob', avatarUrl: null, isConnected: true }],
    });
    const result = applyLobbyAction(lobby, {
      type: 'SPECTATOR_LEFT',
      payload: { userId: MOCK_USERS.bob.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.spectators).toHaveLength(0);
  });

  it('should handle SPECTATOR_PROMOTED', () => {
    const lobby = createClientLobbyState({
      spectators: [{ userId: MOCK_USERS.bob.userId, userName: 'Bob', avatarUrl: null, isConnected: true }],
    });
    const result = applyLobbyAction(lobby, {
      type: 'SPECTATOR_PROMOTED',
      payload: { userId: MOCK_USERS.bob.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.spectators).toHaveLength(0);
    expect(result.players).toHaveLength(2);
    expect(result.players[1].userId).toBe(MOCK_USERS.bob.userId);
  });

  it('should handle HOST_TRANSFERRED', () => {
    const lobby = createClientLobbyState({
      players: [
        createClientPlayer(MOCK_USERS.alice, { isHost: true }),
        createClientPlayer(MOCK_USERS.bob),
      ],
    });
    const result = applyLobbyAction(lobby, {
      type: 'HOST_TRANSFERRED',
      payload: { newHostUserId: MOCK_USERS.bob.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.hostUserId).toBe(MOCK_USERS.bob.userId);
    expect(result.players.find((p) => p.userId === MOCK_USERS.bob.userId)?.isHost).toBe(true);
    expect(result.players.find((p) => p.userId === MOCK_USERS.alice.userId)?.isHost).toBe(false);
  });

  it('should handle SETTINGS_UPDATED', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'SETTINGS_UPDATED',
      payload: { settings: { isPublic: true } },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.settings.isPublic).toBe(true);
  });

  it('should handle PLAYER_READY_CHANGED', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'PLAYER_READY_CHANGED',
      payload: { userId: MOCK_USERS.alice.userId, isReady: true },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.players[0].isReady).toBe(true);
  });

  it('should handle STATE_CHANGED', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'STATE_CHANGED',
      payload: { state: 'VOTING' },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.state).toBe('VOTING');
  });

  it('should handle CHAT_MESSAGE', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'CHAT_MESSAGE',
      payload: {
        id: 'msg-1',
        userId: MOCK_USERS.alice.userId,
        userName: 'Alice',
        content: 'Hello!',
        timestamp: Date.now(),
        type: 'user',
      },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.chat).toHaveLength(1);
    expect(result.chat[0].content).toBe('Hello!');
  });

  it('should handle PLAYER_CONNECTED', () => {
    const lobby = createClientLobbyState({
      players: [createClientPlayer(MOCK_USERS.alice, { isConnected: false })],
    });
    const result = applyLobbyAction(lobby, {
      type: 'PLAYER_CONNECTED',
      payload: { userId: MOCK_USERS.alice.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.players[0].isConnected).toBe(true);
  });

  it('should handle PLAYER_DISCONNECTED', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'PLAYER_DISCONNECTED',
      payload: { userId: MOCK_USERS.alice.userId },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.players[0].isConnected).toBe(false);
  });

  it('should handle GAME_SELECTED', () => {
    const lobby = createClientLobbyState();
    const gameInfo = {
      minigameId: 'rhyme-time',
      displayName: 'Rhyme Time',
      phase: 'instructions' as const,
      timeRemaining: 15,
      publicState: {},
      privateState: {},
    };
    const result = applyLobbyAction(lobby, {
      type: 'GAME_SELECTED',
      payload: { game: gameInfo },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.currentGame).toEqual(gameInfo);
  });

  it('should return lobby unchanged for unknown action types', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'UNKNOWN_ACTION',
      payload: {},
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result).toEqual(lobby);
  });

  it('should handle VOTE_STARTED without modifying lobby', () => {
    const lobby = createClientLobbyState();
    const result = applyLobbyAction(lobby, {
      type: 'VOTE_STARTED',
      payload: {},
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result).toEqual(lobby);
  });
});

// ─── Game Action Reducer Tests ──────────────────────────────────

describe('Game Action Reducer (§4.2)', () => {
  it('should not modify gameState for lobby-level actions', () => {
    const state = {};
    const result = applyGameAction(state, {
      type: 'PLAYER_JOINED',
      payload: {},
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result).toEqual(state);
  });

  it('should store game-specific actions as raw payload', () => {
    const state = {};
    const result = applyGameAction(state, {
      type: 'ANSWER_SUBMITTED',
      payload: { correct: true, score: 100 },
      seq: 1,
      timestamp: Date.now(),
    });
    expect(result.ANSWER_SUBMITTED).toEqual({ correct: true, score: 100 });
    expect(result.lastAction).toBeDefined();
  });

  it('should accumulate multiple game actions', () => {
    let state: Record<string, unknown> = {};
    state = applyGameAction(state, {
      type: 'ROUND_START',
      payload: { roundNum: 1 },
      seq: 1,
      timestamp: Date.now(),
    });
    state = applyGameAction(state, {
      type: 'SCORE_UPDATE',
      payload: { score: 500 },
      seq: 2,
      timestamp: Date.now(),
    });
    expect(state.ROUND_START).toEqual({ roundNum: 1 });
    expect(state.SCORE_UPDATE).toEqual({ score: 500 });
  });
});
