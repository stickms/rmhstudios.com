/**
 * Phase 3 — §6: Join-in-Progress Framework Tests
 *
 * Tests JIP policy enforcement for spectate_only,
 * join_next_subround, and join_immediately policies.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { S2C } from '../../../lib/rmhbox/events';
import { BaseMinigame } from '../../../server/rmhbox/minigames/base-minigame';
import type { MinigameContext, MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';
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
let lobbyId: string;

function setupLobbyWith2PlayersInGame(minigameId: string): void {
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

  // Start game
  gameCoordinator.startGameFlow(lobbyId, minigameId);
  vi.advanceTimersByTime(16_000); // instructions
  callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
  callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
  vi.advanceTimersByTime(4_000); // countdown → PLAYING
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

// ─── §6.1: JIP Policy Enforcement ──────────────────────────────

describe('Join-in-Progress: spectate_only policy (§6.1)', () => {
  it('should force new joiner to spectator during spectate_only game', () => {
    // rhyme-time has spectate_only policy
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));
    setupLobbyWith2PlayersInGame('rhyme-time');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // New player tries to join
    const socketC = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, socketC);
    lobbyManager.handleConnection(socketC.socket as unknown as Socket);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Should become spectator
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(true);
    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(false);
  });
});

describe('Join-in-Progress: join_immediately policy (§6.1)', () => {
  it('should add player directly during join_immediately game', () => {
    // pixel-pushers has join_immediately policy
    MINIGAME_SERVER_REGISTRY.set('pixel-pushers', createTestGameClass(60_000));
    setupLobbyWith2PlayersInGame('pixel-pushers');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    const socketC = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, socketC);
    lobbyManager.handleConnection(socketC.socket as unknown as Socket);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Should become player
    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(true);
  });
});

describe('Join-in-Progress: join_next_subround policy (§6.1)', () => {
  it('should join as spectator with pending status during join_next_subround game', () => {
    // category-crash has join_next_subround policy
    MINIGAME_SERVER_REGISTRY.set('category-crash', createTestGameClass(60_000));

    // Need 3 players for category-crash (minPlayers: 3), set up differently
    socketA = createMockSocket(MOCK_USERS.alice);
    socketB = createMockSocket(MOCK_USERS.bob);
    const socketC = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, socketA);
    registerSocket(serverData, socketB);
    registerSocket(serverData, socketC);

    lobbyManager.handleConnection(socketA.socket as unknown as Socket);
    gameCoordinator.handleConnection(socketA.socket as unknown as Socket);
    lobbyManager.handleConnection(socketB.socket as unknown as Socket);
    gameCoordinator.handleConnection(socketB.socket as unknown as Socket);
    lobbyManager.handleConnection(socketC.socket as unknown as Socket);
    gameCoordinator.handleConnection(socketC.socket as unknown as Socket);

    callEvent(socketA, 'rmhbox:lobby:create', {});
    lobbyId = (findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    gameCoordinator.startGameFlow(lobbyId, 'category-crash');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // New player joins
    const socketD = createMockSocket(MOCK_USERS.diana);
    registerSocket(serverData, socketD);
    lobbyManager.handleConnection(socketD.socket as unknown as Socket);
    callEvent(socketD, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Should be a spectator
    expect(lobby.spectators.has(MOCK_USERS.diana.userId)).toBe(true);

    // Should be in pending join list
    const pending = lobbyManager.getPendingJoinPlayers(lobbyId);
    expect(pending).toContain(MOCK_USERS.diana.userId);
  });
});

// ─── BaseMinigame.handlePlayerJoin ──────────────────────────────

describe('BaseMinigame.handlePlayerJoin', () => {
  it('should have default no-op handlePlayerJoin', () => {
    const mockContext: MinigameContext = {
      lobbyId: 'test',
      players: new Map(),
      settings: {
        isPublic: false,
        maxPlayers: 8,
        maxSpectators: 20,
        allowMidGameJoin: true,
        allowSpectatorPromotion: true,
        autoStartThreshold: null,
        gameDurationOverride: null,
      },
      broadcastToLobby: vi.fn(),
      broadcastToPlayers: vi.fn(),
      sendToPlayer: vi.fn(),
      sendToSpectators: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    // Create a concrete implementation to test
    class ConcreteGame extends BaseMinigame {
      start(): void { /* no-op */ }
      handleInput(): void { /* no-op */ }
      getStateForPlayer(): unknown { return {}; }
      getStateForSpectator(): unknown { return {}; }
      computeResults(): MinigameResults {
        return { rankings: [], awards: [], gameSpecificData: {}, duration: 0 };
      }
    }

    const game = new ConcreteGame(mockContext);
    // Should not throw
    game.handlePlayerJoin('test-user');
  });
});

// ─── LobbyManager.getPendingJoinPlayers ─────────────────────────

describe('LobbyManager.getPendingJoinPlayers', () => {
  it('should return empty array for lobbies without pending players', () => {
    const pending = lobbyManager.getPendingJoinPlayers('nonexistent');
    expect(pending).toEqual([]);
  });

  it('should clear pending players', () => {
    setupLobbyWith2PlayersInGame('rhyme-time');
    lobbyManager.clearPendingJoinPlayers(lobbyId);

    const pending = lobbyManager.getPendingJoinPlayers(lobbyId);
    expect(pending).toEqual([]);
  });
});
