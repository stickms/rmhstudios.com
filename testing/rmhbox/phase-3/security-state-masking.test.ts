/**
 * Phase 3 — Security: State Masking Tests
 *
 * Verifies that players cannot see each other's hidden data,
 * and that spectators receive appropriate state views.
 * This is a dedicated security test per the requirements.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { S2C } from '../../../lib/rmhbox/events';
import { BaseMinigame } from '../../../server/rmhbox/minigames/base-minigame';
import type { MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  callEvent,
  findLastEmitted,
  MOCK_USERS,
} from './setup';
import type { MockServerData } from './setup';
import type { Server, Socket } from 'socket.io';

let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let gameCoordinator: GameCoordinator;

/**
 * A minigame implementation with per-player secret data
 * used to verify state masking.
 */
class SecretGame extends BaseMinigame {
  private secrets = new Map<string, string>();

  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }

  start(): void {
    this.isRunning = true;
    // Assign a unique secret to each player
    let idx = 0;
    for (const [userId] of this.context.players) {
      this.secrets.set(userId, `secret-${idx}`);
      idx++;
    }
  }

  handleInput(): void { /* no-op */ }

  getStateForPlayer(userId: string): unknown {
    // Each player only sees their OWN secret
    return {
      mySecret: this.secrets.get(userId) ?? null,
      playerCount: this.context.players.size,
    };
  }

  getStateForSpectator(): unknown {
    // Spectators see NO secrets
    return {
      mySecret: null,
      playerCount: this.context.players.size,
      spectatorView: true,
    };
  }

  computeResults(): MinigameResults {
    return {
      rankings: [],
      awards: [],
      gameSpecificData: {},
      duration: 0,
    };
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
  gameCoordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, stateSyncService);

  // Register the SecretGame
  MINIGAME_SERVER_REGISTRY.set('rhyme-time', SecretGame);
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

describe('State Masking Security', () => {
  it('should give Player A only their own secret, not Player B\'s', () => {
    const sockA = createMockSocket(MOCK_USERS.alice);
    const sockB = createMockSocket(MOCK_USERS.bob);
    const sockSpec = createMockSocket(MOCK_USERS.charlie);
    registerSocket(serverData, sockA);
    registerSocket(serverData, sockB);
    registerSocket(serverData, sockSpec);

    lobbyManager.handleConnection(sockA.socket as unknown as Socket);
    gameCoordinator.handleConnection(sockA.socket as unknown as Socket);
    lobbyManager.handleConnection(sockB.socket as unknown as Socket);
    gameCoordinator.handleConnection(sockB.socket as unknown as Socket);
    lobbyManager.handleConnection(sockSpec.socket as unknown as Socket);
    gameCoordinator.handleConnection(sockSpec.socket as unknown as Socket);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(sockSpec, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    // Start game
    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000); // instructions
    callEvent(sockA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(sockB, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000); // countdown → PLAYING

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // ─── CRITICAL SECURITY ASSERTIONS ────────────────────────

    // Build client state for Player A
    const aliceState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    const aliceGameState = aliceState.currentGame?.publicState as { mySecret: string | null };

    // Build client state for Player B
    const bobState = lobbyManager.buildClientState(lobby, MOCK_USERS.bob.userId);
    const bobGameState = bobState.currentGame?.publicState as { mySecret: string | null };

    // Build client state for Spectator
    const specState = lobbyManager.buildClientState(lobby, MOCK_USERS.charlie.userId);
    const specGameState = specState.currentGame?.publicState as { mySecret: string | null; spectatorView?: boolean };

    // Player A sees their own secret
    expect(aliceGameState.mySecret).not.toBeNull();
    // Player B sees their own secret
    expect(bobGameState.mySecret).not.toBeNull();

    // SECURITY: Player A does NOT see Player B's secret
    expect(aliceGameState.mySecret).not.toBe(bobGameState.mySecret);

    // SECURITY: Spectator sees NO secrets
    expect(specGameState.mySecret).toBeNull();
    expect(specGameState.spectatorView).toBe(true);
  });

  it('should not expose socket IDs in client state', () => {
    const sockA = createMockSocket(MOCK_USERS.alice);
    const sockB = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, sockA);
    registerSocket(serverData, sockB);

    lobbyManager.handleConnection(sockA.socket as unknown as Socket);
    lobbyManager.handleConnection(sockB.socket as unknown as Socket);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const clientState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    // Client state should NOT contain socketId
    const stateStr = JSON.stringify(clientState);
    expect(stateStr).not.toContain('socketId');
  });

  it('should not expose internal Maps in client state', () => {
    const sockA = createMockSocket(MOCK_USERS.alice);
    registerSocket(serverData, sockA);

    lobbyManager.handleConnection(sockA.socket as unknown as Socket);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const clientState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    // Players should be an array, not a Map
    expect(Array.isArray(clientState.players)).toBe(true);
    expect(Array.isArray(clientState.spectators)).toBe(true);
    expect(Array.isArray(clientState.chat)).toBe(true);
  });

  it('should correctly scope player role in client state', () => {
    const sockA = createMockSocket(MOCK_USERS.alice);
    const sockB = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, sockA);
    registerSocket(serverData, sockB);

    lobbyManager.handleConnection(sockA.socket as unknown as Socket);
    lobbyManager.handleConnection(sockB.socket as unknown as Socket);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    const lobby = lobbyManager.getLobby(lobbyId)!;

    const playerState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    const spectatorState = lobbyManager.buildClientState(lobby, MOCK_USERS.bob.userId);

    expect(playerState.myRole).toBe('player');
    expect(spectatorState.myRole).toBe('spectator');
  });

  it('should include correct myUserId in client state', () => {
    const sockA = createMockSocket(MOCK_USERS.alice);
    registerSocket(serverData, sockA);

    lobbyManager.handleConnection(sockA.socket as unknown as Socket);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const clientState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    expect(clientState.myUserId).toBe(MOCK_USERS.alice.userId);
  });

  it('should include correct phase in client state during instructions', () => {
    const sockA = createMockSocket(MOCK_USERS.alice);
    const sockB = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, sockA);
    registerSocket(serverData, sockB);

    lobbyManager.handleConnection(sockA.socket as unknown as Socket);
    gameCoordinator.handleConnection(sockA.socket as unknown as Socket);
    lobbyManager.handleConnection(sockB.socket as unknown as Socket);
    gameCoordinator.handleConnection(sockB.socket as unknown as Socket);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    gameCoordinator.startGameFlow(lobbyId, 'rhyme-time');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('INSTRUCTIONS');

    const clientState = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    expect(clientState.currentGame?.phase).toBe('instructions');
  });
});
