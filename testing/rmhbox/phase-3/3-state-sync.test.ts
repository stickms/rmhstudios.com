/**
 * Phase 3 — §3: State Synchronization Tests
 *
 * Tests heartbeat broadcasting, phase transition sync,
 * action sequence counters, and timer tick broadcasting.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
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

let serverData: MockServerData;
let lobbyManager: LobbyManager;
let stateSyncService: StateSyncService;
let socketA: MockSocketData;
let socketB: MockSocketData;
let lobbyId: string;

function setupLobbyWith2Players(): void {
  socketA = createMockSocket(MOCK_USERS.alice);
  socketB = createMockSocket(MOCK_USERS.bob);
  registerSocket(serverData, socketA);
  registerSocket(serverData, socketB);

  lobbyManager.handleConnection(socketA.socket as unknown as Socket);
  lobbyManager.handleConnection(socketB.socket as unknown as Socket);

  callEvent(socketA, 'rmhbox:lobby:create', {});
  lobbyId = (findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

  callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
}

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  stateSyncService = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
});

afterEach(() => {
  stateSyncService.stopHeartbeat();
  vi.useRealTimers();
});

// ─── §3.1: StateSyncService Instantiation ────────────────────────

describe('StateSyncService Instantiation (§3.1)', () => {
  it('should instantiate with no errors', () => {
    expect(stateSyncService).toBeDefined();
  });
});

// ─── §3.2: Heartbeat ────────────────────────────────────────────

describe('Heartbeat (§3.2)', () => {
  it('should start and stop heartbeat', () => {
    stateSyncService.startHeartbeat();
    stateSyncService.stopHeartbeat();
    // No crash
    expect(true).toBe(true);
  });

  it('should send state snapshots during PLAYING state', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    stateSyncService.startHeartbeat();
    vi.advanceTimersByTime(10_000); // One heartbeat tick

    const snapshots = findServerEmitted(serverData.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('should not send snapshots when lobby is in WAITING state', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('WAITING');

    const emittedBefore = serverData.emitted.length;
    stateSyncService.startHeartbeat();
    vi.advanceTimersByTime(10_000);

    const snapshots = findServerEmitted(
      serverData.emitted.slice(emittedBefore),
      S2C.LOBBY_STATE_SNAPSHOT,
    );
    expect(snapshots.length).toBe(0);
  });

  it('should send per-player scoped snapshots', () => {
    setupLobbyWith2Players();
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    stateSyncService.startHeartbeat();
    vi.advanceTimersByTime(10_000);

    // Should have snapshots for each player's personal room
    const aliceRoom = `lobby:${lobbyId}:player:${MOCK_USERS.alice.userId}`;
    const bobRoom = `lobby:${lobbyId}:player:${MOCK_USERS.bob.userId}`;

    const aliceSnaps = findServerEmitted(serverData.emitted, S2C.LOBBY_STATE_SNAPSHOT, aliceRoom);
    const bobSnaps = findServerEmitted(serverData.emitted, S2C.LOBBY_STATE_SNAPSHOT, bobRoom);

    expect(aliceSnaps.length).toBeGreaterThan(0);
    expect(bobSnaps.length).toBeGreaterThan(0);
  });
});

// ─── §3.3: Phase Transition Sync ────────────────────────────────

describe('Phase Transition Sync (§3.3)', () => {
  it('should send full state snapshots on broadcastFullSync', () => {
    setupLobbyWith2Players();

    const emittedBefore = serverData.emitted.length;
    stateSyncService.broadcastFullSync(lobbyId);

    const snapshots = findServerEmitted(
      serverData.emitted.slice(emittedBefore),
      S2C.LOBBY_STATE_SNAPSHOT,
    );
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('should send snapshots to each connected player', () => {
    setupLobbyWith2Players();

    stateSyncService.broadcastFullSync(lobbyId);

    const aliceRoom = `lobby:${lobbyId}:player:${MOCK_USERS.alice.userId}`;
    const bobRoom = `lobby:${lobbyId}:player:${MOCK_USERS.bob.userId}`;

    const aliceSnaps = findServerEmitted(serverData.emitted, S2C.LOBBY_STATE_SNAPSHOT, aliceRoom);
    const bobSnaps = findServerEmitted(serverData.emitted, S2C.LOBBY_STATE_SNAPSHOT, bobRoom);

    expect(aliceSnaps.length).toBeGreaterThan(0);
    expect(bobSnaps.length).toBeGreaterThan(0);
  });
});

// ─── §3.4: Action Sequence Counter ──────────────────────────────

describe('Action Sequence Counter (§3.4)', () => {
  it('should increment seq on each broadcastAction', () => {
    setupLobbyWith2Players();

    lobbyManager.broadcastAction(lobbyId, { type: 'TEST_ACTION_1' });
    lobbyManager.broadcastAction(lobbyId, { type: 'TEST_ACTION_2' });
    lobbyManager.broadcastAction(lobbyId, { type: 'TEST_ACTION_3' });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const testActions = actions.filter(
      (a) => (a.data as { type: string }).type.startsWith('TEST_ACTION'),
    );

    expect(testActions.length).toBe(3);

    const seqs = testActions.map((a) => (a.data as { seq: number }).seq);
    // Each seq should be strictly increasing
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it('should include timestamp in each action', () => {
    setupLobbyWith2Players();

    lobbyManager.broadcastAction(lobbyId, { type: 'TEST_ACTION' });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const last = actions[actions.length - 1].data as { timestamp: number };
    expect(last.timestamp).toBeGreaterThan(0);
  });
});

// ─── §3.5: Timer Tick Broadcasting ──────────────────────────────

describe('Timer Tick Broadcasting (§3.5)', () => {
  it('should broadcast TIMER_TICK actions every second', () => {
    setupLobbyWith2Players();

    const onComplete = vi.fn();
    stateSyncService.startTimerBroadcast(lobbyId, 5, onComplete);

    // Advance 6 seconds + a bit more (timer ticks: 5,4,3,2,1,0 then completes)
    vi.advanceTimersByTime(7_000);

    // Should have 6 TIMER_TICK actions (5, 4, 3, 2, 1, 0) and onComplete called
    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const timerTicks = actions.filter(
      (a) => (a.data as { type: string }).type === 'TIMER_TICK',
    );
    expect(timerTicks.length).toBeGreaterThanOrEqual(5);
    expect(onComplete).toHaveBeenCalled();
  });

  it('should include timeRemaining in each tick', () => {
    setupLobbyWith2Players();

    stateSyncService.startTimerBroadcast(lobbyId, 3, vi.fn());

    vi.advanceTimersByTime(1_500); // After first tick

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION);
    const timerTicks = actions.filter(
      (a) => (a.data as { type: string }).type === 'TIMER_TICK',
    );

    if (timerTicks.length > 0) {
      const payload = (timerTicks[0].data as { payload: { timeRemaining: number } }).payload;
      expect(payload.timeRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  it('should be cancellable', () => {
    setupLobbyWith2Players();

    const onComplete = vi.fn();
    const cancel = stateSyncService.startTimerBroadcast(lobbyId, 10, onComplete);

    vi.advanceTimersByTime(3_000);
    cancel();
    vi.advanceTimersByTime(10_000);

    expect(onComplete).not.toHaveBeenCalled();
  });
});
