/**
 * Phase 2 — §4: Lobby Leave & Disconnect Tests
 *
 * Tests explicit leave, host succession, disconnect grace period,
 * and lobby disband on last player departure.
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
  vi.useRealTimers();
  lobbyManager.stopGarbageCollector();
});

function setupSocket(user: typeof MOCK_USERS.alice): MockSocketData {
  const sock = createMockSocket(user);
  registerSocket(serverData, sock);
  lobbyManager.handleConnection(sock.socket as unknown as Socket);
  return sock;
}

function callEvent(sock: MockSocketData, event: string, payload: unknown): void {
  const handler = sock.socket.on.mock.calls.find((c: unknown[]) => c[0] === event);
  handler![1](sock.socket, payload);
}

function createLobbyAndGetId(sock: MockSocketData): string {
  callEvent(sock, 'rmhbox:lobby:create', {});
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Lobby Leave (§4.1)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should remove player from lobby on leave', () => {
    callEvent(socketB, 'rmhbox:lobby:leave', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(false);
    expect(lobby.players.size).toBe(1);
  });

  it('should remove user from userToLobby index on leave', () => {
    callEvent(socketB, 'rmhbox:lobby:leave', { lobbyId });

    expect(lobbyManager.getLobbyByUserId(MOCK_USERS.bob.userId)).toBeUndefined();
  });

  it('should broadcast PLAYER_LEFT action', () => {
    callEvent(socketB, 'rmhbox:lobby:leave', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const leftAction = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_LEFT',
    );
    expect(leftAction).toBeDefined();
  });

  it('should transfer host when host leaves', () => {
    // Alice (host) leaves — Bob should become host
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.hostUserId).toBe(MOCK_USERS.bob.userId);
  });

  it('should broadcast HOST_TRANSFERRED when host leaves', () => {
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const transferAction = actions.find(
      (a) => (a.data as { type: string }).type === 'HOST_TRANSFERRED',
    );
    expect(transferAction).toBeDefined();
    expect(
      (transferAction!.data as { payload: { newHostUserId: string } }).payload.newHostUserId,
    ).toBe(MOCK_USERS.bob.userId);
  });

  it('should disband lobby when last player leaves', () => {
    callEvent(socketB, 'rmhbox:lobby:leave', { lobbyId });
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });

    expect(lobbyManager.getLobby(lobbyId)).toBeUndefined();
    expect(lobbyManager.getLobbies().size).toBe(0);
  });

  it('should emit lobby disbanded when last player leaves', () => {
    callEvent(socketB, 'rmhbox:lobby:leave', { lobbyId });
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });

    const disbanded = findServerEmitted(serverData.emitted, S2C.LOBBY_DISBANDED, `lobby:${lobbyId}`);
    expect(disbanded.length).toBeGreaterThanOrEqual(1);
  });

  it('should add system chat on leave', () => {
    callEvent(socketB, 'rmhbox:lobby:leave', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsgs = lobby.chat.filter((m) => m.type === 'system');
    expect(systemMsgs.some((m) => m.content.includes('Bob') && m.content.includes('left'))).toBe(true);
  });

  it('should return error when leaving without being in a lobby', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:leave', { lobbyId });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should handle spectator leave correctly', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
    callEvent(socketC, 'rmhbox:lobby:leave', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(false);
  });

  it('should transfer host to earliest joined player', () => {
    // Add Charlie with a later joinedAt
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Set Bob's joinedAt earlier than Charlie's
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const bobPlayer = lobby.players.get(MOCK_USERS.bob.userId)!;
    const charliePlayer = lobby.players.get(MOCK_USERS.charlie.userId)!;
    bobPlayer.joinedAt = 1000;
    charliePlayer.joinedAt = 2000;

    // Alice (host) leaves
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });

    expect(lobby.hostUserId).toBe(MOCK_USERS.bob.userId);
  });
});

describe('Disconnect Handling (§4.2)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should mark player as disconnected on socket disconnect', () => {
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const player = lobby.players.get(MOCK_USERS.bob.userId)!;
    expect(player.isConnected).toBe(false);
    expect(player.socketId).toBeNull();
  });

  it('should keep player in lobby during grace period', () => {
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    // Advance time less than grace period (120s)
    vi.advanceTimersByTime(60_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(true);
  });

  it('should remove player after grace period expires', () => {
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    // Advance past grace period (120s)
    vi.advanceTimersByTime(121_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(false);
  });

  it('should broadcast PLAYER_DISCONNECTED action', () => {
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const disconnectAction = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_DISCONNECTED',
    );
    expect(disconnectAction).toBeDefined();
  });

  it('should remove spectators immediately on disconnect (no grace period)', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    lobbyManager.handleDisconnect(socketC.socket as unknown as Socket);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(false);
  });

  it('should cancel grace timer when cancelGraceTimer is called', () => {
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);
    lobbyManager.cancelGraceTimer(MOCK_USERS.bob.userId);

    // Advance past grace period
    vi.advanceTimersByTime(130_000);

    // Player should still be in the lobby (timer was cancelled)
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(true);
  });
});
