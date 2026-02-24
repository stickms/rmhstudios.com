/**
 * Phase 3 — §8: Integration Tests
 *
 * Tests the full game lifecycle from lobby creation through
 * multiple rounds, verifying the complete state machine flow.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { VoteManager } from '../../../server/rmhbox/vote-manager';
import { ReconnectionHandler } from '../../../server/rmhbox/reconnection';
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
let voteManager: VoteManager;
let reconnection: ReconnectionHandler;

function setupServices(): void {
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
  gameCoordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, stateSyncService);
  voteManager = new VoteManager(serverData.server as unknown as Server, lobbyManager, gameCoordinator);
  reconnection = new ReconnectionHandler(serverData.server as unknown as Server, lobbyManager, stateSyncService);
}

function createAndRegister(user: typeof MOCK_USERS.alice): MockSocketData {
  const sock = createMockSocket(user);
  registerSocket(serverData, sock);
  lobbyManager.handleConnection(sock.socket as unknown as Socket);
  gameCoordinator.handleConnection(sock.socket as unknown as Socket);
  voteManager.handleConnection(sock.socket as unknown as Socket);
  return sock;
}

beforeEach(() => {
  vi.useFakeTimers();
  setupServices();
  MINIGAME_SERVER_REGISTRY.set('rhyme-time', createTestGameClass(3_000));
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

// ─── Full Lifecycle: Vote → Game → Results → Back to Waiting ────

describe('Full Game Lifecycle Integration', () => {
  it('should complete a full vote → play → results → waiting cycle', () => {
    const sockA = createAndRegister(MOCK_USERS.alice);
    const sockB = createAndRegister(MOCK_USERS.bob);
    const sockC = createAndRegister(MOCK_USERS.charlie);

    // Create lobby
    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

    // Join
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(sockC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('WAITING');
    expect(lobby.players.size).toBe(3);

    // Direct select rhyme-time (which has a registered server handler)
    callEvent(sockA, 'rmhbox:game:select', { lobbyId, minigameId: 'rhyme-time' });
    expect(lobby.state).toBe('INSTRUCTIONS');

    // Advance through instructions
    vi.advanceTimersByTime(16_000);
    expect(lobby.state).toBe('PRELOADING');

    // All ready
    callEvent(sockA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(sockB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(sockC, 'rmhbox:game:ready_to_render', { lobbyId });
    expect(lobby.state).toBe('COUNTDOWN');

    // Advance through countdown
    vi.advanceTimersByTime(4_000);
    expect(lobby.state).toBe('PLAYING');

    // Game auto-completes after 3000ms
    vi.advanceTimersByTime(5_000);
    expect(lobby.state).toBe('ROUND_RESULTS');
    expect(lobby.roundNumber).toBe(1);

    // Results display — host force-skips to advance (infinite timer)
    callEvent(sockA, 'rmhbox:game:force_skip', { lobbyId });
    expect(lobby.state).toBe('WAITING');
    expect(lobby.currentGame).toBeNull();
  });

  it('should support multiple consecutive rounds', () => {
    const sockA = createAndRegister(MOCK_USERS.alice);
    const sockB = createAndRegister(MOCK_USERS.bob);
    const sockC = createAndRegister(MOCK_USERS.charlie);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(sockC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const lobby = lobbyManager.getLobby(lobbyId)!;

    // Run 2 rounds via host direct select
    for (let round = 1; round <= 2; round++) {
      // Direct select
      callEvent(sockA, 'rmhbox:game:select', { lobbyId, minigameId: 'rhyme-time' });
      expect(lobby.state).toBe('INSTRUCTIONS');

      // Instructions
      vi.advanceTimersByTime(16_000);
      expect(lobby.state).toBe('PRELOADING');

      // Ready
      callEvent(sockA, 'rmhbox:game:ready_to_render', { lobbyId });
      callEvent(sockB, 'rmhbox:game:ready_to_render', { lobbyId });
      callEvent(sockC, 'rmhbox:game:ready_to_render', { lobbyId });
      expect(lobby.state).toBe('COUNTDOWN');

      // Countdown
      vi.advanceTimersByTime(4_000);
      expect(lobby.state).toBe('PLAYING');

      // Game completes
      vi.advanceTimersByTime(3_500);
      expect(lobby.state).toBe('ROUND_RESULTS');
      // roundNumber resets per game flow, so always 1 per game
      expect(lobby.roundNumber).toBe(1);
      expect(lobby.matchHistory.length).toBe(round);

      // Results — host force-skips to advance (infinite timer)
      callEvent(sockA, 'rmhbox:game:force_skip', { lobbyId });
      expect(lobby.state).toBe('WAITING');
    }

    // Match history should have 2 entries
    expect(lobby.matchHistory.length).toBe(2);

    // Scores should be accumulated
    let totalScore = 0;
    for (const player of lobby.players.values()) {
      totalScore += player.score;
    }
    expect(totalScore).toBeGreaterThan(0);
  });

  it('should handle reconnection mid-game', () => {
    const sockA = createAndRegister(MOCK_USERS.alice);
    const sockB = createAndRegister(MOCK_USERS.bob);
    const sockC = createAndRegister(MOCK_USERS.charlie);

    callEvent(sockA, 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(sockA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(sockB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(sockC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Start game
    callEvent(sockA, 'rmhbox:game:select', { lobbyId, minigameId: 'rhyme-time' });
    vi.advanceTimersByTime(16_000);
    callEvent(sockA, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(sockB, 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(sockC, 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    // Bob disconnects
    lobbyManager.handleDisconnect(sockB.socket as unknown as Socket);
    expect(lobby.players.get(MOCK_USERS.bob.userId)!.isConnected).toBe(false);

    // Bob reconnects
    const newBobSocket = createMockSocket(MOCK_USERS.bob);
    registerSocket(serverData, newBobSocket);
    reconnection.attemptReconnect(newBobSocket.socket as unknown as Socket);

    // Bob should be reconnected
    expect(lobby.players.get(MOCK_USERS.bob.userId)!.isConnected).toBe(true);

    // Game should still be running
    expect(lobby.state).toBe('PLAYING');

    // Game completes
    vi.advanceTimersByTime(3_500);
    expect(lobby.state).toBe('ROUND_RESULTS');
  });
});
