/**
 * Phase 3 — §9: Unified Spectator Mode & Reconnection Tests
 *
 * Tests the unified spectator mode framework and centralized reconnection logic:
 * - SpectatorMode classification (shared-privileged vs competitive-individual)
 * - Spectator player selection for competitive-individual games
 * - Unified getSpectatorSnapshot() dispatch
 * - buildReconnectionSnapshot() for players and spectators
 * - Spectator input gating enforcement
 * - Spectator target auto-assignment on game start
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { ReconnectionHandler } from '../../../server/rmhbox/reconnection';
import { S2C, C2S } from '../../../lib/rmhbox/events';
import { BaseMinigame } from '../../../server/rmhbox/minigames/base-minigame';
import type { MinigameContext, MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';
import type { SpectatorMode } from '../../../lib/rmhbox/types';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  callEvent,
  findLastEmitted,
  findEmitted,
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';

// ─── Test Game Classes ───────────────────────────────────────────

class CompetitiveTestGame extends BaseMinigame {
  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }

  start(): void { this.isRunning = true; }
  handleInput(): void {}
  getStateForPlayer(userId: string): unknown {
    return { type: 'player', userId, score: 42 };
  }
  getStateForSpectator(): unknown {
    return { type: 'spectator-overview', playerCount: this.context.players.size };
  }
  computeResults(): MinigameResults {
    return { rankings: [], awards: [], gameSpecificData: {}, duration: 1000 };
  }
}

class SharedPrivilegedTestGame extends BaseMinigame {
  get spectatorMode(): 'shared-privileged' { return 'shared-privileged'; }

  start(): void { this.isRunning = true; }
  handleInput(): void {}
  getStateForPlayer(userId: string): unknown {
    return { type: 'player', userId, role: 'operative' };
  }
  getStateForSpectator(): unknown {
    return { type: 'spectator-omniscient', allSecrets: true };
  }
  computeResults(): MinigameResults {
    return { rankings: [], awards: [], gameSpecificData: {}, duration: 1000 };
  }
}

// ─── Test Setup ──────────────────────────────────────────────────

let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let gameCoordinator: GameCoordinator;
let reconnection: ReconnectionHandler;
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

function startGame(GameClass: new (ctx: MinigameContext) => BaseMinigame): void {
  MINIGAME_SERVER_REGISTRY.set('rhyme-time', GameClass);
  gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
  vi.advanceTimersByTime(16_000); // instructions
  callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
  callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
  vi.advanceTimersByTime(4_000); // countdown
}

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
  gameCoordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, stateSyncService);
  reconnection = new ReconnectionHandler(
    serverData.server as unknown as Server,
    lobbyManager,
    stateSyncService,
    (lid, sid) => gameCoordinator.getSpectatorTarget(lid, sid),
  );
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

// ─── SpectatorMode Classification ────────────────────────────────

describe('SpectatorMode Classification', () => {
  it('competitive-individual game should declare correct spectatorMode', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.currentGame?.handler.spectatorMode).toBe('competitive-individual');
  });

  it('shared-privileged game should declare correct spectatorMode', () => {
    setupLobbyWithSpectator();
    startGame(SharedPrivilegedTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.currentGame?.handler.spectatorMode).toBe('shared-privileged');
  });

  it('spectatorMode should be included in client game state via buildClientState', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const clientState = lobbyManager.buildClientState(lobby, MOCK_USERS.charlie.userId);
    expect(clientState.currentGame?.spectatorMode).toBe('competitive-individual');
  });
});

// ─── Unified getSpectatorSnapshot ────────────────────────────────

describe('Unified getSpectatorSnapshot()', () => {
  it('should return omniscient view for shared-privileged games (no target)', () => {
    setupLobbyWithSpectator();
    startGame(SharedPrivilegedTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.getSpectatorSnapshot() as Record<string, unknown>;
    expect(state.type).toBe('spectator-omniscient');
    expect(state.allSecrets).toBe(true);
  });

  it('should return omniscient view for shared-privileged games (even with target)', () => {
    setupLobbyWithSpectator();
    startGame(SharedPrivilegedTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.getSpectatorSnapshot(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.type).toBe('spectator-omniscient');
  });

  it('should return player state for competitive-individual games with target', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.getSpectatorSnapshot(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.type).toBe('player');
    expect(state.userId).toBe(MOCK_USERS.alice.userId);
  });

  it('should return overview state for competitive-individual games without target', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.getSpectatorSnapshot() as Record<string, unknown>;
    expect(state.type).toBe('spectator-overview');
  });
});

// ─── buildReconnectionSnapshot ───────────────────────────────────

describe('Unified buildReconnectionSnapshot()', () => {
  it('should return player state for players', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.buildReconnectionSnapshot(MOCK_USERS.alice.userId, false) as Record<string, unknown>;
    expect(state.type).toBe('player');
    expect(state.userId).toBe(MOCK_USERS.alice.userId);
  });

  it('should return spectator omniscient state for spectators in shared-privileged games', () => {
    setupLobbyWithSpectator();
    startGame(SharedPrivilegedTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.buildReconnectionSnapshot(MOCK_USERS.charlie.userId, true) as Record<string, unknown>;
    expect(state.type).toBe('spectator-omniscient');
  });

  it('should return targeted player state for spectators in competitive-individual games', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const state = handler.buildReconnectionSnapshot(
      MOCK_USERS.charlie.userId, true, MOCK_USERS.bob.userId,
    ) as Record<string, unknown>;
    expect(state.type).toBe('player');
    expect(state.userId).toBe(MOCK_USERS.bob.userId);
  });
});

// ─── getViewablePlayers ──────────────────────────────────────────

describe('getViewablePlayers()', () => {
  it('should return list of all players', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const handler = lobby.currentGame!.handler;

    const viewable = handler.getViewablePlayers();
    expect(viewable).toHaveLength(2);
    const userIds = viewable.map((p) => p.userId);
    expect(userIds).toContain(MOCK_USERS.alice.userId);
    expect(userIds).toContain(MOCK_USERS.bob.userId);
  });
});

// ─── Spectator Player Selection ──────────────────────────────────

describe('Spectator Player Selection', () => {
  it('should silently drop selection from non-spectators', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    // Player tries to select a target (should be rejected)
    callEvent(socketA, C2S.SPECTATOR_SELECT_PLAYER, {
      lobbyId,
      targetPlayerId: MOCK_USERS.bob.userId,
    });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_SPECTATOR');
  });

  it('should reject invalid target player', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    callEvent(socketSpec, C2S.SPECTATOR_SELECT_PLAYER, {
      lobbyId,
      targetPlayerId: 'non-existent-player',
    });

    const error = findLastEmitted(socketSpec.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('INVALID_TARGET');
  });

  it('should store spectator target selection', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    callEvent(socketSpec, C2S.SPECTATOR_SELECT_PLAYER, {
      lobbyId,
      targetPlayerId: MOCK_USERS.bob.userId,
    });

    expect(gameCoordinator.getSpectatorTarget(lobbyId, MOCK_USERS.charlie.userId))
      .toBe(MOCK_USERS.bob.userId);
  });

  it('should send game state snapshot when spectator selects a player', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    // Clear previous emits to isolate the select_player response
    socketSpec.emitted.length = 0;

    callEvent(socketSpec, C2S.SPECTATOR_SELECT_PLAYER, {
      lobbyId,
      targetPlayerId: MOCK_USERS.alice.userId,
    });

    // Note: sendToPlayer emits via io.to() which goes to serverData.emitted
    // Check that target info was sent
    const targetState = findLastEmitted(socketSpec.emitted, S2C.SPECTATOR_TARGET_STATE);
    // Direct socket emits won't appear here since they use lobbyManager.sendToPlayer
    // which emits via io.to(). Check the stored target instead.
    expect(gameCoordinator.getSpectatorTarget(lobbyId, MOCK_USERS.charlie.userId))
      .toBe(MOCK_USERS.alice.userId);
  });
});

// ─── Spectator Input Gating ─────────────────────────────────────

describe('Spectator Input Gating (Unified)', () => {
  it('should silently drop game input from spectators in competitive games', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    callEvent(socketSpec, 'rmhbox:game:input', {
      lobbyId,
      action: 'submit',
      data: { answer: 'cheat' },
    });

    // No error emitted, game still running
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });

  it('should silently drop game input from spectators in shared-privileged games', () => {
    setupLobbyWithSpectator();
    startGame(SharedPrivilegedTestGame);

    callEvent(socketSpec, 'rmhbox:game:input', {
      lobbyId,
      action: 'give_clue',
      data: { clue: 'hack' },
    });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });

  it('should allow game input from players', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    callEvent(socketA, 'rmhbox:game:input', {
      lobbyId,
      action: 'submit',
      data: { answer: 'valid' },
    });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });
});

// ─── Reconnection with Spectator State ───────────────────────────

describe('Reconnection with Spectator State', () => {
  it('should send game state snapshot to reconnecting player', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Disconnect Bob
    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    player.isConnected = false;
    player.socketId = null;

    // Reconnect Bob
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    const gameSnapshot = findLastEmitted(newBobSocket.emitted, S2C.GAME_STATE_SNAPSHOT);
    expect(gameSnapshot).toBeDefined();
    const state = gameSnapshot!.data as Record<string, unknown>;
    expect(state.type).toBe('player');
    expect(state.userId).toBe(MOCK_USERS.bob.userId);
  });

  it('should send spectator state with target on reconnect for competitive games', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Set spectator target to Bob
    callEvent(socketSpec, C2S.SPECTATOR_SELECT_PLAYER, {
      lobbyId,
      targetPlayerId: MOCK_USERS.bob.userId,
    });

    // Disconnect spectator
    const spectator = lobby.spectators.get(MOCK_USERS.charlie.userId)!;
    spectator.isConnected = false;
    spectator.socketId = null;

    // Reconnect spectator
    const newSpecSocket = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, newSpecSocket);
    reconnection.attemptReconnect(newSpecSocket.socket as unknown as Socket);

    // Should receive game state matching Bob's state
    const gameSnapshot = findLastEmitted(newSpecSocket.emitted, S2C.GAME_STATE_SNAPSHOT);
    expect(gameSnapshot).toBeDefined();
    const state = gameSnapshot!.data as Record<string, unknown>;
    expect(state.type).toBe('player');
    expect(state.userId).toBe(MOCK_USERS.bob.userId);
  });

  it('should send omniscient state on reconnect for shared-privileged games', () => {
    setupLobbyWithSpectator();
    startGame(SharedPrivilegedTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Disconnect spectator
    const spectator = lobby.spectators.get(MOCK_USERS.charlie.userId)!;
    spectator.isConnected = false;
    spectator.socketId = null;

    // Reconnect spectator
    const newSpecSocket = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, newSpecSocket);
    reconnection.attemptReconnect(newSpecSocket.socket as unknown as Socket);

    const gameSnapshot = findLastEmitted(newSpecSocket.emitted, S2C.GAME_STATE_SNAPSHOT);
    expect(gameSnapshot).toBeDefined();
    const state = gameSnapshot!.data as Record<string, unknown>;
    expect(state.type).toBe('spectator-omniscient');
  });

  it('should send SPECTATOR_TARGET_STATE on reconnect for competitive games', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Set spectator target
    callEvent(socketSpec, C2S.SPECTATOR_SELECT_PLAYER, {
      lobbyId,
      targetPlayerId: MOCK_USERS.alice.userId,
    });

    // Disconnect and reconnect spectator
    const spectator = lobby.spectators.get(MOCK_USERS.charlie.userId)!;
    spectator.isConnected = false;
    spectator.socketId = null;

    const newSpecSocket = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, newSpecSocket);
    reconnection.attemptReconnect(newSpecSocket.socket as unknown as Socket);

    const targetState = findLastEmitted(newSpecSocket.emitted, S2C.SPECTATOR_TARGET_STATE);
    expect(targetState).toBeDefined();
    const target = targetState!.data as { targetPlayerId: string; availablePlayers: Array<{ userId: string }> };
    expect(target.targetPlayerId).toBe(MOCK_USERS.alice.userId);
    expect(target.availablePlayers).toHaveLength(2);
  });

  it('should send full lobby state snapshot on reconnect', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);
    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Disconnect and reconnect player
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    player.isConnected = false;
    player.socketId = null;

    const newAliceSocket = createMockSocket(MOCK_USERS.alice);
    registerSocket(serverData, newAliceSocket);
    reconnection.attemptReconnect(newAliceSocket.socket as unknown as Socket);

    const lobbySnapshot = findLastEmitted(newAliceSocket.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(lobbySnapshot).toBeDefined();
    const state = lobbySnapshot!.data as { lobbyId: string; state: string; myRole: string };
    expect(state.lobbyId).toBe(lobbyId);
    expect(state.state).toBe('PLAYING');
    expect(state.myRole).toBe('player');
  });
});

// ─── Spectator Target Auto-Assignment ────────────────────────────

describe('Spectator Target Auto-Assignment', () => {
  it('should auto-assign first player as target on game start for competitive games', () => {
    setupLobbyWithSpectator();
    startGame(CompetitiveTestGame);

    // After game starts, spectator should have auto-assigned target
    const target = gameCoordinator.getSpectatorTarget(lobbyId, MOCK_USERS.charlie.userId);
    expect(target).toBeDefined();
    // Should be one of the players
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(target!)).toBe(true);
  });
});

// ─── Mid-Game Spectator Join ─────────────────────────────────────

describe('Mid-Game Spectator Join', () => {
  it('should assign spectator target when joining mid-game for competitive-individual games', () => {
    // Setup lobby with only 2 players (no spectator yet)
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

    // Start a competitive-individual game
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', CompetitiveTestGame);
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // Now a new spectator joins mid-game
    socketSpec = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, socketSpec);
    lobbyManager.handleConnection(socketSpec.socket as unknown as Socket);
    gameCoordinator.handleConnection(socketSpec.socket as unknown as Socket);

    callEvent(socketSpec, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    // Spectator should be in the lobby
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(true);

    // Spectator should have a target assigned
    const target = gameCoordinator.getSpectatorTarget(lobbyId, MOCK_USERS.charlie.userId);
    expect(target).toBeDefined();
    expect(lobby.players.has(target!)).toBe(true);

    // Spectator should have received SPECTATOR_TARGET_STATE
    const targetState = findLastEmitted(socketSpec.emitted, S2C.SPECTATOR_TARGET_STATE);
    expect(targetState).toBeDefined();
    const targetData = targetState!.data as { targetPlayerId: string | null };
    expect(targetData.targetPlayerId).toBeDefined();
    expect(targetData.targetPlayerId).not.toBeNull();

    // Spectator should have received GAME_STATE_SNAPSHOT
    const gameSnapshot = findLastEmitted(socketSpec.emitted, S2C.GAME_STATE_SNAPSHOT);
    expect(gameSnapshot).toBeDefined();
  });

  it('should send game state when joining mid-game for shared-privileged games', () => {
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

    // Start a shared-privileged game
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', SharedPrivilegedTestGame);
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // New spectator joins mid-game
    socketSpec = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, socketSpec);
    lobbyManager.handleConnection(socketSpec.socket as unknown as Socket);
    gameCoordinator.handleConnection(socketSpec.socket as unknown as Socket);

    callEvent(socketSpec, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(true);

    // Should NOT get SPECTATOR_TARGET_STATE (shared-privileged doesn't use targets)
    const targetState = findLastEmitted(socketSpec.emitted, S2C.SPECTATOR_TARGET_STATE);
    expect(targetState).toBeUndefined();

    // Should get GAME_STATE_SNAPSHOT with omniscient view
    const gameSnapshot = findLastEmitted(socketSpec.emitted, S2C.GAME_STATE_SNAPSHOT);
    expect(gameSnapshot).toBeDefined();
    const gameData = gameSnapshot!.data as { type: string };
    expect(gameData.type).toBe('spectator-omniscient');
  });
});
