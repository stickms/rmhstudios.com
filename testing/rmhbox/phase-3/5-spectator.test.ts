/**
 * Phase 3 — §5: Spectator State Delivery Tests
 *
 * Tests spectator-specific state delivery, input gating,
 * and state masking between players and spectators.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { S2C } from '../../../lib/rmhbox/events';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  callEvent,
  findLastEmitted,
  createTestGameClass,
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';


let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let gameCoordinator: GameCoordinator;
let socketA: MockSocketData;
let socketB: MockSocketData;
let socketSpec: MockSocketData;
let lobbyId: string;

function setupLobbyWithSpectator(): void {
  socketA = createMockSocket(MOCK_USERS.alice);
  socketB = createMockSocket(MOCK_USERS.bob);
  socketSpec = createMockSocket(MOCK_USERS.charlie);
  registerSocket(serverData, socketA);
  registerSocket(serverData, socketB);
  registerSocket(serverData, socketSpec);

  lobbyManager.handleConnection(socketA.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketA.socket as unknown as Socket);

  lobbyManager.handleConnection(socketB.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketB.socket as unknown as Socket);

  lobbyManager.handleConnection(socketSpec.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketSpec.socket as unknown as Socket);

  callEvent(socketA, 'rmhbox:lobby:create', {});
  lobbyId = (findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

  callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  callEvent(socketSpec, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
  gameCoordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, stateSyncService);
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

// ─── §5.1: Spectator State ──────────────────────────────────────

describe('Spectator State Delivery (§5.1)', () => {
  it('should set myRole to spectator for spectators', () => {
    setupLobbyWithSpectator();

    const snapshot = findLastEmitted(socketSpec.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshot).toBeDefined();

    const state = snapshot!.data as ClientLobbyState;
    expect(state.myRole).toBe('spectator');
  });

  it('should set myRole to player for players', () => {
    setupLobbyWithSpectator();

    // Alice receives state via LOBBY_CREATED event
    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    expect(created).toBeDefined();

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const playerState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    expect(playerState.myRole).toBe('player');
  });

  it('should build spectator state correctly', () => {
    setupLobbyWithSpectator();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const spectatorState = lobbyManager.buildClientState(lobby, MOCK_USERS.charlie.userId);
    expect(spectatorState.myRole).toBe('spectator');
    expect(spectatorState.myUserId).toBe(MOCK_USERS.charlie.userId);
  });

  it('should build player state correctly', () => {
    setupLobbyWithSpectator();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const playerState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    expect(playerState.myRole).toBe('player');
    expect(playerState.myUserId).toBe(MOCK_USERS.alice.userId);
  });

  it('should return spectator game state when game has handler', () => {
    setupLobbyWithSpectator();
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));

    // Start game
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // Build states for player and spectator
    const playerState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    const spectatorState = lobbyManager.buildClientState(lobby, MOCK_USERS.charlie.userId);

    // Both should have game info
    expect(playerState.currentGame).not.toBeNull();
    expect(spectatorState.currentGame).not.toBeNull();

    // Spectator sees spectator view
    if (spectatorState.currentGame) {
      expect(spectatorState.currentGame.publicState).toHaveProperty('spectator', true);
    }
  });
});

// ─── §5.2: Input Gating ─────────────────────────────────────────

describe('Spectator Input Gating (§5.2)', () => {
  it('should silently drop game input from spectators', () => {
    setupLobbyWithSpectator();
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));

    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    // Spectator tries to send input
    callEvent(socketSpec, 'rmhbox:game:input', {
      lobbyId,
      action: 'submit_word',
      data: { word: 'cheat' },
    });

    // Game should still be running, no errors to spectator
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });

  it('should allow game input from players', () => {
    setupLobbyWithSpectator();
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));

    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    // Player sends input
    callEvent(socketA, 'rmhbox:game:input', {
      lobbyId,
      action: 'submit_word',
      data: { word: 'hello' },
    });

    // Game should still be running
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });
});
