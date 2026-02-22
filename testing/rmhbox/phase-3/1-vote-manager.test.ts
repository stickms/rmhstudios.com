/**
 * Phase 3 — §1: Vote Manager Tests
 *
 * Tests vote initiation, casting, resolution, tie-breaking,
 * host force-skip, and error handling.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator } from '../../../server/rmhbox/game-coordinator';
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
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';
import type { VoteStartedPayload, VoteCastPayload, VoteResultPayload } from '../../../lib/rmhbox/types';

let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let gameCoordinator: GameCoordinator;
let voteManager: VoteManager;
let socketA: MockSocketData; // host
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

  // Register handlers
  lobbyManager.handleConnection(socketA.socket as unknown as Socket);
  voteManager.handleConnection(socketA.socket as unknown as Socket);

  lobbyManager.handleConnection(socketB.socket as unknown as Socket);
  voteManager.handleConnection(socketB.socket as unknown as Socket);

  lobbyManager.handleConnection(socketC.socket as unknown as Socket);
  voteManager.handleConnection(socketC.socket as unknown as Socket);

  // Create lobby
  callEvent(socketA, 'rmhbox:lobby:create', {});
  lobbyId = (findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

  // Join players
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
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── §1.1: VoteManager Instantiation ────────────────────────────

describe('VoteManager Instantiation (§1.1)', () => {
  it('should instantiate with no errors', () => {
    expect(voteManager).toBeDefined();
  });
});

// ─── §1.2: Vote Initiation ──────────────────────────────────────

describe('Vote Initiation (§1.2)', () => {
  beforeEach(() => {
    setupLobbyWith3Players();
  });

  it('should start a vote with candidates when host requests', () => {
    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('VOTING');

    // Check server broadcast
    const voteEvents = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_STARTED);
    expect(voteEvents.length).toBeGreaterThan(0);

    const payload = voteEvents[voteEvents.length - 1].data as VoteStartedPayload;
    expect(payload.candidates).toBeDefined();
    expect(payload.candidates.length).toBeGreaterThan(0);
    expect(payload.candidates.length).toBeLessThanOrEqual(5);
    expect(payload.durationSeconds).toBe(30);
    expect(payload.endsAt).toBeGreaterThan(Date.now() - 1000);
  });

  it('should include correct candidate fields', () => {
    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const voteEvents = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_STARTED);
    const payload = voteEvents[voteEvents.length - 1].data as VoteStartedPayload;

    for (const candidate of payload.candidates) {
      expect(candidate.minigameId).toBeTruthy();
      expect(candidate.displayName).toBeTruthy();
      expect(candidate.description).toBeTruthy();
      expect(candidate.category).toBeTruthy();
      expect(candidate.icon).toBeTruthy();
      expect(candidate.playerRange).toMatch(/\d+–\d+/);
    }
  });

  it('should broadcast STATE_CHANGED action on vote start', () => {
    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const stateChanged = actions.find(
      (a) => (a.data as { type: string }).type === 'STATE_CHANGED',
    );
    expect(stateChanged).toBeDefined();
  });

  it('should reject vote from non-host', () => {
    callEvent(socketB, 'rmhbox:game:start_vote', { lobbyId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should reject vote when not in WAITING state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });

  it('should reject vote with insufficient players', () => {
    // Create a lobby with only 1 player
    const soloSocket = createMockSocket({ ...MOCK_USERS.alice, userId: 'user-solo', sessionToken: 'token-solo', userName: 'Solo' });
    registerSocket(serverData, soloSocket);
    lobbyManager.handleConnection(soloSocket.socket as unknown as Socket);
    voteManager.handleConnection(soloSocket.socket as unknown as Socket);
    callEvent(soloSocket, 'rmhbox:lobby:create', {});
    const soloLobbyId = (findLastEmitted(soloSocket.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

    callEvent(soloSocket, 'rmhbox:game:start_vote', { lobbyId: soloLobbyId });

    const error = findLastEmitted(soloSocket.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });
});

// ─── §1.3: Vote Casting ─────────────────────────────────────────

describe('Vote Casting (§1.3)', () => {
  let candidates: VoteStartedPayload['candidates'];

  beforeEach(() => {
    setupLobbyWith3Players();
    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const voteEvents = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_STARTED);
    candidates = (voteEvents[voteEvents.length - 1].data as VoteStartedPayload).candidates;
  });

  it('should accept a valid vote and broadcast update', () => {
    const candidateId = candidates[0].minigameId;
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidateId });

    const updates = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_UPDATE);
    expect(updates.length).toBeGreaterThan(0);

    const payload = updates[updates.length - 1].data as VoteCastPayload;
    expect(payload.userId).toBe(MOCK_USERS.alice.userId);
    expect(payload.totalVoters).toBe(1);
    expect(payload.totalPlayers).toBe(3);
    expect(payload.tallies[candidateId]).toBe(1);
  });

  it('should overwrite previous vote', () => {
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[1].minigameId });

    const updates = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_UPDATE);
    const lastUpdate = updates[updates.length - 1].data as VoteCastPayload;
    expect(lastUpdate.totalVoters).toBe(1); // still 1 voter
    expect(lastUpdate.tallies[candidates[1].minigameId]).toBe(1);
    expect(lastUpdate.tallies[candidates[0].minigameId]).toBe(0);
  });

  it('should reject vote for invalid candidate', () => {
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: 'nonexistent-game' });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });

  it('should reject vote from spectator', () => {
    // Add a spectator
    const specSocket = createMockSocket({ ...MOCK_USERS.diana, userId: 'user-spectator', sessionToken: 'token-spec', userName: 'Spec' });
    registerSocket(serverData, specSocket);
    lobbyManager.handleConnection(specSocket.socket as unknown as Socket);
    voteManager.handleConnection(specSocket.socket as unknown as Socket);
    callEvent(specSocket, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    callEvent(specSocket, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });

    const error = findLastEmitted(specSocket.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });

  it('should auto-resolve when all players have voted', () => {
    const candidateId = candidates[0].minigameId;
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidateId });
    callEvent(socketB, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidateId });
    callEvent(socketC, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidateId });

    // Vote should have resolved
    const results = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_RESULT);
    expect(results.length).toBeGreaterThan(0);

    const result = results[results.length - 1].data as VoteResultPayload;
    expect(result.winnerId).toBe(candidateId);
    expect(result.wasUnanimous).toBe(true);
  });

  it('should track tallies correctly with multiple voters', () => {
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });
    callEvent(socketB, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[1].minigameId });

    const updates = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_UPDATE);
    const lastUpdate = updates[updates.length - 1].data as VoteCastPayload;
    expect(lastUpdate.totalVoters).toBe(2);
    expect(lastUpdate.tallies[candidates[0].minigameId]).toBe(1);
    expect(lastUpdate.tallies[candidates[1].minigameId]).toBe(1);
  });
});

// ─── §1.4: Vote Resolution ──────────────────────────────────────

describe('Vote Resolution (§1.4)', () => {
  let candidates: VoteStartedPayload['candidates'];

  beforeEach(() => {
    setupLobbyWith3Players();
    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const voteEvents = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_STARTED);
    candidates = (voteEvents[voteEvents.length - 1].data as VoteStartedPayload).candidates;
  });

  it('should resolve vote on timer expiry', () => {
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });
    callEvent(socketB, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });

    // Advance timer to 30 seconds
    vi.advanceTimersByTime(30_000);

    const results = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_RESULT);
    expect(results.length).toBeGreaterThan(0);

    const result = results[results.length - 1].data as VoteResultPayload;
    expect(result.winnerId).toBe(candidates[0].minigameId);
    expect(result.tallies[candidates[0].minigameId]).toBe(2);
  });

  it('should break ties randomly', () => {
    // Vote for different candidates to create a tie
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });
    callEvent(socketB, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[1].minigameId });

    vi.advanceTimersByTime(30_000);

    const results = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_RESULT);
    const result = results[results.length - 1].data as VoteResultPayload;
    // Winner should be one of the tied candidates
    expect([candidates[0].minigameId, candidates[1].minigameId]).toContain(result.winnerId);
  });

  it('should select random game with zero votes', () => {
    vi.advanceTimersByTime(30_000);

    const results = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_RESULT);
    expect(results.length).toBeGreaterThan(0);

    const result = results[results.length - 1].data as VoteResultPayload;
    expect(result.winnerId).toBeTruthy();
    // Should be one of the candidates
    const candidateIds = candidates.map((c) => c.minigameId);
    expect(candidateIds).toContain(result.winnerId);
  });
});

// ─── §1.5: Host Force-Skip ──────────────────────────────────────

describe('Host Force-Skip During Vote (§1.5)', () => {
  let candidates: VoteStartedPayload['candidates'];

  beforeEach(() => {
    setupLobbyWith3Players();
    callEvent(socketA, 'rmhbox:game:start_vote', { lobbyId });

    const voteEvents = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_STARTED);
    candidates = (voteEvents[voteEvents.length - 1].data as VoteStartedPayload).candidates;
  });

  it('should resolve vote immediately when host force-skips', () => {
    callEvent(socketA, 'rmhbox:game:cast_vote', { lobbyId, minigameId: candidates[0].minigameId });

    callEvent(socketA, 'rmhbox:game:force_skip', { lobbyId });

    const results = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_RESULT);
    expect(results.length).toBeGreaterThan(0);

    const result = results[results.length - 1].data as VoteResultPayload;
    expect(result.winnerId).toBe(candidates[0].minigameId);
  });

  it('should select random game when force-skipping with zero votes', () => {
    callEvent(socketA, 'rmhbox:game:force_skip', { lobbyId });

    const results = findServerEmitted(serverData.emitted, S2C.GAME_VOTE_RESULT);
    expect(results.length).toBeGreaterThan(0);

    const result = results[results.length - 1].data as VoteResultPayload;
    const candidateIds = candidates.map((c) => c.minigameId);
    expect(candidateIds).toContain(result.winnerId);
  });

  it('should reject force-skip from non-host', () => {
    callEvent(socketB, 'rmhbox:game:force_skip', { lobbyId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });
});
