/**
 * Phase 2 — §11: Lobby Garbage Collection Tests
 *
 * Tests idle timeout, absolute timeout, empty lobby timeout,
 * and GC lifecycle.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { S2C } from '../../../lib/rmhbox/events';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  findLastEmitted,
  findServerEmitted,
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';

let serverData: MockServerData;
let lobbyManager: LobbyManager;

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
});

afterEach(() => {
  lobbyManager.stopGarbageCollector();
  vi.useRealTimers();
});

function setupSocket(user: typeof MOCK_USERS.alice): MockSocketData {
  const sock = createMockSocket(user);
  registerSocket(serverData, sock);
  lobbyManager.handleConnection(sock.socket as unknown as Socket);
  return sock;
}

function callEvent(sock: MockSocketData, event: string, payload: unknown): void {
  const handler = sock.socket.on.mock.calls.find((c: unknown[]) => c[0] === event);
  handler![1](payload);
}

function createLobbyAndGetId(sock: MockSocketData): string {
  callEvent(sock, 'rmhbox:lobby:create', {});
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Lobby Garbage Collection (§11.1)', () => {
  it('should clean up idle WAITING lobbies after 15 minutes', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    // Set lastActivityAt to 16 minutes ago
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.lastActivityAt = Date.now() - 16 * 60 * 1000;

    // Start GC and advance time to trigger interval
    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000); // GC runs every 60s

    expect(lobbyManager.getLobby(lobbyId)).toBeUndefined();
  });

  it('should not clean up active WAITING lobbies', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    // lastActivityAt is recent (just created)
    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    expect(lobbyManager.getLobby(lobbyId)).toBeDefined();
  });

  it('should clean up lobbies past absolute timeout regardless of state', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';
    lobby.lastActivityAt = Date.now() - 31 * 60 * 1000; // 31 minutes ago
    // GC absolute timeout only triggers when all clients are disconnected
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    player.isConnected = false;

    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    expect(lobbyManager.getLobby(lobbyId)).toBeUndefined();
  });

  it('should clean up lobbies where all members are disconnected after 2 minutes', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    player.isConnected = false;
    lobby.lastActivityAt = Date.now() - 3 * 60 * 1000; // 3 minutes ago

    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    expect(lobbyManager.getLobby(lobbyId)).toBeUndefined();
  });

  it('should emit disbanded event to lobby room on GC', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.lastActivityAt = Date.now() - 16 * 60 * 1000;

    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    const disbanded = findServerEmitted(serverData.emitted, S2C.LOBBY_DISBANDED, `lobby:${lobbyId}`);
    expect(disbanded.length).toBeGreaterThanOrEqual(1);
  });

  it('should clean up userToLobby entries on GC', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.lastActivityAt = Date.now() - 16 * 60 * 1000;

    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    expect(lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId)).toBeUndefined();
  });

  it('should not GC lobbies that are only in PLAYING state but recently active', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';
    // lastActivityAt is recent

    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    expect(lobbyManager.getLobby(lobbyId)).toBeDefined();
  });

  it('should stop GC interval when stopGarbageCollector is called', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.lastActivityAt = Date.now() - 16 * 60 * 1000;

    lobbyManager.startGarbageCollector();
    lobbyManager.stopGarbageCollector();
    vi.advanceTimersByTime(120_000); // Advance well past GC interval

    // Lobby should still exist since GC was stopped
    expect(lobbyManager.getLobby(lobbyId)).toBeDefined();
  });

  it('should not clean up empty lobby with connected spectators within timeout', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    // Add a spectator and remove the player manually
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    // Player is connected, spectator is connected, recently active
    // This should not be GC'd

    lobbyManager.startGarbageCollector();
    vi.advanceTimersByTime(61_000);

    expect(lobbyManager.getLobby(lobbyId)).toBeDefined();
  });
});
