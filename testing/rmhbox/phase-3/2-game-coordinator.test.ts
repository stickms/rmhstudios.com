/**
 * Phase 3 — §2: Game Coordinator Tests
 *
 * Tests game lifecycle orchestration: INSTRUCTIONS → PRELOADING →
 * COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING, host direct select,
 * force-skip, game errors, and disconnect handling.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { VoteManager } from '../../../server/rmhbox/vote-manager';
import { S2C } from '../../../lib/rmhbox/events';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  callEvent,
  findLastEmitted,
  findServerEmitted,
  createTestGameClass,
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';
import type { RoundResultsPayload } from '../../../lib/rmhbox/types';

let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let gameCoordinator: GameCoordinator;
let voteManager: VoteManager;
let socketA: MockSocketData;
let socketB: MockSocketData;
let socketC: MockSocketData;
let lobbyId: string;

function setupLobbyWith3Players(): void {
  socketA = createMockSocket(MOCK_USERS.alice);
  socketB = createMockSocket(MOCK_USERS.bob);
  socketC = createMockSocket(MOCK_USERS.charlie);
  registerSocket(serverData, socketA);
  registerSocket(serverData, socketB);
  registerSocket(serverData, socketC);

  lobbyManager.handleConnection(socketA.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketA.socket as unknown as Socket);
  voteManager.handleConnection(socketA.socket as unknown as Socket);

  lobbyManager.handleConnection(socketB.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketB.socket as unknown as Socket);
  voteManager.handleConnection(socketB.socket as unknown as Socket);

  lobbyManager.handleConnection(socketC.socket as unknown as Socket);
  gameCoordinator.handleConnection(socketC.socket as unknown as Socket);
  voteManager.handleConnection(socketC.socket as unknown as Socket);

  callEvent(socketA, 'rmhbox:lobby:create', {});
  lobbyId = (findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

  callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
}

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
  gameCoordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, stateSyncService);
  voteManager = new VoteManager(serverData.server as unknown as Server, lobbyManager, gameCoordinator);

  // Register test game in server registry
  MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(5000));
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

// ─── §2.1: GameCoordinator Instantiation ─────────────────────────

describe('GameCoordinator Instantiation (§2.1)', () => {
  it('should instantiate with no errors', () => {
    expect(gameCoordinator).toBeDefined();
  });

  it('should support registering minigame handlers', () => {
    expect(MINIGAME_SERVER_REGISTRY.has('rhyme-time')).toBe(true);
  });
});

// ─── §2.2: Game Flow — Instructions Phase ───────────────────────

describe('Instructions Phase (§2.2 Step 1)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
  });

  it('should transition to INSTRUCTIONS when game flow starts', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('INSTRUCTIONS');
  });

  it('should broadcast instructions payload', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');

    const events = findServerEmitted(serverData.emitted, S2C.GAME_INSTRUCTIONS);
    expect(events.length).toBeGreaterThan(0);

    const payload = events[events.length - 1].data as Record<string, unknown>;
    expect(payload.minigameId).toBe('rhyme-time');
    expect(payload.title).toBe('Rhyme Time');
    expect(payload.durationSeconds).toBe(15);
  });

  it('should broadcast STATE_CHANGED action', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const stateChanged = actions.find(
      (a) => (a.data as { type: string }).type === 'STATE_CHANGED' &&
             (a.data as { payload: { state: string } }).payload.state === 'INSTRUCTIONS',
    );
    expect(stateChanged).toBeDefined();
  });

  it('should transition to PRELOADING after instruction timer', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');

    // Advance past instruction timer (15 seconds) + tick intervals
    vi.advanceTimersByTime(16_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PRELOADING');
  });
});

// ─── §2.2: Game Flow — Preloading Phase ─────────────────────────

describe('Preloading Phase (§2.2 Step 2)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    // Skip instructions
    vi.advanceTimersByTime(16_000);
  });

  it('should broadcast preload_start event', () => {
    const events = findServerEmitted(serverData.emitted, S2C.GAME_PRELOAD_START);
    expect(events.length).toBeGreaterThan(0);
  });

  it('should track ready_to_render from players', () => {
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });

    const progressEvents = findServerEmitted(serverData.emitted, S2C.GAME_PRELOAD_PROGRESS);
    expect(progressEvents.length).toBeGreaterThan(0);

    const payload = progressEvents[progressEvents.length - 1].data as {
      players: Array<{ userId: string; ready: boolean }>;
      allReady: boolean;
    };
    const alice = payload.players.find((p) => p.userId === MOCK_USERS.alice.userId);
    expect(alice?.ready).toBe(true);
    expect(payload.allReady).toBe(false);
  });

  it('should transition to COUNTDOWN when all players are ready', () => {
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('COUNTDOWN');
  });

  it('should force-proceed after 30s timeout', () => {
    // Don't send any ready_to_render
    vi.advanceTimersByTime(31_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('COUNTDOWN');
  });
});

// ─── §2.2: Game Flow — Countdown Phase ──────────────────────────

describe('Countdown Phase (§2.2 Step 3)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    // Skip instructions
    vi.advanceTimersByTime(16_000);
    // All ready
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
  });

  it('should broadcast countdown event', () => {
    const events = findServerEmitted(serverData.emitted, S2C.GAME_COUNTDOWN);
    expect(events.length).toBeGreaterThan(0);

    const payload = events[events.length - 1].data as { seconds: number };
    expect(payload.seconds).toBe(3);
  });

  it('should transition to PLAYING after countdown', () => {
    vi.advanceTimersByTime(4_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });
});

// ─── §2.2: Game Flow — Playing Phase ────────────────────────────

describe('Playing Phase (§2.2 Step 4)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    // Skip through instructions → preloading → countdown
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown
  });

  it('should broadcast game_started event', () => {
    const events = findServerEmitted(serverData.emitted, S2C.GAME_STARTED);
    expect(events.length).toBeGreaterThan(0);

    const payload = events[events.length - 1].data as { minigameId: string };
    expect(payload.minigameId).toBe('rhyme-time');
  });

  it('should set lobby state to PLAYING', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
    expect(lobby.currentGame).not.toBeNull();
    expect(lobby.currentGame!.minigameId).toBe('rhyme-time');
  });

  it('should instantiate game handler', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.currentGame!.handler).not.toBeNull();
  });
});

// ─── §2.3: Game Complete — Round Results ─────────────────────────

describe('Round Results (§2.3)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    // Skip through lifecycle
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown
    // Game auto-completes after 5000ms
    vi.advanceTimersByTime(5_500);
  });

  it('should transition to ROUND_RESULTS after game completes', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('ROUND_RESULTS');
  });

  it('should broadcast round results', () => {
    const events = findServerEmitted(serverData.emitted, S2C.GAME_ROUND_RESULTS);
    expect(events.length).toBeGreaterThan(0);

    const payload = events[events.length - 1].data as RoundResultsPayload;
    expect(payload.minigameId).toBe('rhyme-time');
    expect(payload.rankings.length).toBeGreaterThan(0);
    expect(payload.roundNumber).toBe(1);
  });

  it('should increment round number', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.roundNumber).toBe(1);
  });

  it('should update player scores', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    let hasScore = false;
    for (const player of lobby.players.values()) {
      if (player.score > 0) hasScore = true;
    }
    expect(hasScore).toBe(true);
  });

  it('should add match to history', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.matchHistory.length).toBe(1);
    expect(lobby.matchHistory[0].minigameId).toBe('rhyme-time');
  });

  it('should return to WAITING after results timer', () => {
    vi.advanceTimersByTime(11_000); // results display (10s)

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('WAITING');
    expect(lobby.currentGame).toBeNull();
  });

  it('should reset player ready states when returning to WAITING', () => {
    vi.advanceTimersByTime(11_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    for (const player of lobby.players.values()) {
      expect(player.isReady).toBe(false);
      expect(player.roundScore).toBe(0);
    }
  });
});

// ─── §2.4: Game Error ────────────────────────────────────────────

describe('Game Error Handling (§2.4)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
  });

  it('should return lobby to WAITING on game error', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown

    // Simulate error
    gameCoordinator.handleGameError(lobbyId, new Error('Test error'));

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('WAITING');
    expect(lobby.currentGame).toBeNull();
  });

  it('should broadcast error state change', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    gameCoordinator.handleGameError(lobbyId, new Error('Test error'));

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const errorAction = actions.find(
      (a) => {
        const d = a.data as { type: string; payload?: { reason?: string } };
        return d.type === 'STATE_CHANGED' && d.payload?.reason === 'GAME_ERROR';
      },
    );
    expect(errorAction).toBeDefined();
  });
});

// ─── §2.5: Host Direct Select ────────────────────────────────────

describe('Host Direct Select (§2.5)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
  });

  it('should start game flow directly when host selects a game', () => {
    callEvent(socketA, 'rmhbox:game:select', { lobbyId, minigameId: 'rhyme-time' });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('INSTRUCTIONS');
  });

  it('should reject selection from non-host', () => {
    callEvent(socketB, 'rmhbox:game:select', { lobbyId, minigameId: 'rhyme-time' });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should reject selection when not in WAITING state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    callEvent(socketA, 'rmhbox:game:select', { lobbyId, minigameId: 'rhyme-time' });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });

  it('should reject selection of unknown game', () => {
    callEvent(socketA, 'rmhbox:game:select', { lobbyId, minigameId: 'nonexistent-game' });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });

  it('should reject selection when player count is out of range', () => {
    // undercover-agent requires minPlayers: 4
    callEvent(socketA, 'rmhbox:game:select', { lobbyId, minigameId: 'undercover-agent' });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('INSUFFICIENT_PLAYERS');
  });
});

// ─── §2.7: Host Force-Skip ──────────────────────────────────────

describe('Host Force-Skip for All Phases (§2.7)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
  });

  it('should skip INSTRUCTIONS phase when host force-skips', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('INSTRUCTIONS');

    callEvent(socketA, 'rmhbox:game:force_skip', { lobbyId });

    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('PRELOADING');
  });

  it('should skip PRELOADING phase when host force-skips', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // past instructions
    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('PRELOADING');

    callEvent(socketA, 'rmhbox:game:force_skip', { lobbyId });

    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('COUNTDOWN');
  });

  it('should skip ROUND_RESULTS phase when host force-skips', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown
    vi.advanceTimersByTime(5_500); // game completes
    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('ROUND_RESULTS');

    callEvent(socketA, 'rmhbox:game:force_skip', { lobbyId });

    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('WAITING');
  });

  it('should not skip COUNTDOWN phase', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('COUNTDOWN');

    callEvent(socketA, 'rmhbox:game:force_skip', { lobbyId });

    // Should still be COUNTDOWN (not skippable)
    expect(lobbyManager.getLobby(lobbyId)!.state).toBe('COUNTDOWN');
  });

  it('should reject force-skip from non-host', () => {
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');

    callEvent(socketB, 'rmhbox:game:force_skip', { lobbyId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });
});

// ─── §2.8: Disconnect During Game ────────────────────────────────

describe('Disconnect During Game (§2.8)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
    // Register test game with minPlayers 2
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));

    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown → now PLAYING
  });

  it('should notify game handler when player disconnects', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
    expect(lobby.currentGame?.handler).not.toBeNull();

    // Simulate disconnect
    const player = lobby.players.get(MOCK_USERS.charlie.userId)!;
    player.isConnected = false;
    gameCoordinator.handleDisconnect(socketC.socket as unknown as Socket);

    // No crash
    expect(lobby.state).toBe('PLAYING');
  });
});

// ─── Game Input Routing ──────────────────────────────────────────

describe('Game Input Routing', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
    MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(60_000));

    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socketA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socketC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);
  });

  it('should route input to game handler', () => {
    callEvent(socketA, 'rmhbox:game:input', { lobbyId, action: 'submit_word', data: { word: 'hello' } });

    // No crash — input was routed
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });

  it('should silently drop input from spectators', () => {
    // Add a spectator
    const specSocket = createMockSocket({ ...MOCK_USERS.diana, userId: 'user-spec', sessionToken: 'token-spec', userName: 'Spec' });
    registerSocket(serverData, specSocket);
    lobbyManager.handleConnection(specSocket.socket as unknown as Socket);
    gameCoordinator.handleConnection(specSocket.socket as unknown as Socket);
    callEvent(specSocket, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    // Spectator tries to send input
    callEvent(specSocket, 'rmhbox:game:input', { lobbyId, action: 'submit_word', data: { word: 'cheat' } });

    // No error emitted — silently dropped. Game is still running.
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');
  });
});
