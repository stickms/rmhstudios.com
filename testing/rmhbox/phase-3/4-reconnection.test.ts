/**
 * Phase 3 — §4: Reconnection Protocol Tests
 *
 * Tests reconnection flow, duplicate session handling,
 * grace period management, and state delivery on reconnect.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { ReconnectionHandler } from '../../../server/rmhbox/reconnection';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { S2C } from '../../../lib/rmhbox/events';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  callEvent,
  findLastEmitted,
  findEmitted,
  findServerEmitted,
  createTestGameClass,
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';


let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let gameCoordinator: GameCoordinator;
let reconnection: ReconnectionHandler;
let socketA: MockSocketData;
let socketB: MockSocketData;
let lobbyId: string;

function setupLobbyWith2Players(): void {
  socketA = createMockSocket(MOCK_USERS.alice);
  socketB = createMockSocket(MOCK_USERS.bob);
  registerSocket(serverData, socketA);
  registerSocket(serverData, socketB);

  lobbyManager.handleConnection(socketA.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketA.socket as unknown as Socket);

  lobbyManager.handleConnection(socketB.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketB.socket as unknown as Socket);

  callEvent(socketA, 'rmhbox:lobby:create', {});
  lobbyId = (findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

  callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
}

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
  gameCoordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, stateSyncService);
  reconnection = new ReconnectionHandler(serverData.server as unknown as Server, lobbyManager, stateSyncService);
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

// ─── §4.1: ReconnectionHandler Instantiation ─────────────────────

describe('ReconnectionHandler Instantiation (§4.1)', () => {
  it('should instantiate with no errors', () => {
    expect(reconnection).toBeDefined();
  });
});

// ─── §4.2: Reconnection Flow ────────────────────────────────────

describe('Reconnection Flow (§4.2)', () => {
  it('should do nothing for users not in a lobby', () => {
    const newSocket = createMockSocket({ ...MOCK_USERS.diana, userId: 'user-new', sessionToken: 'token-new', userName: 'New' });
    registerSocket(serverData, newSocket);

    reconnection.attemptReconnect(newSocket.socket as unknown as Socket);

    // No state snapshot emitted (not a reconnection)
    const snapshots = findEmitted(newSocket.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshots.length).toBe(0);
  });

  it('should reconnect a disconnected player', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Simulate disconnect
    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    player.isConnected = false;
    player.socketId = null;

    // Create new socket for Bob (same userId)
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);

    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    // Player should be reconnected
    expect(player.isConnected).toBe(true);
    expect(player.socketId).toBe(newBobSocket.socket.id);
  });

  it('should send full state snapshot on reconnect', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    player.isConnected = false;
    player.socketId = null;

    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);

    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    const snapshot = findLastEmitted(newBobSocket.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshot).toBeDefined();

    const state = snapshot!.data as ClientLobbyState;
    expect(state.lobbyId).toBe(lobbyId);
    expect(state.myUserId).toBe(MOCK_USERS.bob.userId);
  });

  it('should cancel grace timer on reconnect', () => {
    setupLobbyWith2Players();

    // Simulate disconnect which starts grace timer
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    // Reconnect
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    // Grace timer should be cancelled — player should NOT be removed after 120s
    vi.advanceTimersByTime(130_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(true);
  });

  it('should broadcast PLAYER_CONNECTED action on reconnect', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    player.isConnected = false;
    player.socketId = null;

    const emittedBefore = serverData.emitted.length;
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    const actions = findServerEmitted(serverData.emitted.slice(emittedBefore), S2C.GAME_ACTION);
    const connected = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_CONNECTED',
    );
    expect(connected).toBeDefined();
  });

  it('should re-join socket rooms on reconnect', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    player.isConnected = false;
    player.socketId = null;

    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    expect(newBobSocket.joinedRooms.has(`lobby:${lobbyId}`)).toBe(true);
    expect(newBobSocket.joinedRooms.has(`lobby:${lobbyId}:players`)).toBe(true);
    expect(newBobSocket.joinedRooms.has(`lobby:${lobbyId}:player:${MOCK_USERS.bob.userId}`)).toBe(true);
  });
});

// ─── Duplicate Session Handling ──────────────────────────────────

describe('Duplicate Session Handling (§4.2)', () => {
  it('should disconnect old socket when new socket connects', () => {
    setupLobbyWith2Players();

    // Create a new socket with same userId as Bob
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);

    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    // Old socket should have been disconnected
    expect(socketB.socket.disconnect).toHaveBeenCalled();

    // Old socket should receive DUPLICATE_SESSION error
    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('DUPLICATE_SESSION');
  });

  it('should update player socket to new socket', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    expect(player.socketId).toBe(newBobSocket.socket.id);
    expect(player.isConnected).toBe(true);
  });
});

// ─── §4.3: Disconnect Grace Period ──────────────────────────────

describe('Disconnect Grace Period (§4.3)', () => {
  it('should broadcast PLAYER_DISCONNECTED on disconnect', () => {
    setupLobbyWith2Players();

    const emittedBefore = serverData.emitted.length;
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    const actions = findServerEmitted(serverData.emitted.slice(emittedBefore), S2C.GAME_ACTION);
    const disconnected = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_DISCONNECTED',
    );
    expect(disconnected).toBeDefined();
  });

  it('should remove player after grace period expires', () => {
    setupLobbyWith2Players();

    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    vi.advanceTimersByTime(121_000); // 120s grace period

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(false);
  });

  it('should keep player during grace period', () => {
    setupLobbyWith2Players();

    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    vi.advanceTimersByTime(60_000); // Half of grace period

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(true);
    expect(lobby.players.get(MOCK_USERS.bob.userId)!.isConnected).toBe(false);
  });
});

// ─── Reconnection with Game State ────────────────────────────────

describe('Reconnection During Game', () => {
  it('should send game state snapshot on reconnect during PLAYING', () => {
    setupLobbyWith2Players();
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));

    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Start game flow and advance to PLAYING
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown

    expect(lobby.state).toBe('PLAYING');

    // Disconnect Bob
    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    player.isConnected = false;
    player.socketId = null;

    // Reconnect Bob
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    // Should have received game state snapshot
    const gameSnapshot = findLastEmitted(newBobSocket.emitted, S2C.GAME_STATE_SNAPSHOT);
    expect(gameSnapshot).toBeDefined();

    const lobbySnapshot = findLastEmitted(newBobSocket.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(lobbySnapshot).toBeDefined();
  });
});
