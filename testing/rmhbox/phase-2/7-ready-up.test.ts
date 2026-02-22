/**
 * Phase 2 — §7: Ready-Up System Tests
 *
 * Tests ready toggle, auto-start threshold triggering,
 * and spectator exclusion from ready status.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
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

describe('Ready-Up System (§7.1)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should toggle player ready status from false to true', () => {
    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    expect(player.isReady).toBe(true);
  });

  it('should toggle player ready status back to false', () => {
    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });
    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    expect(player.isReady).toBe(false);
  });

  it('should broadcast PLAYER_READY_CHANGED action', () => {
    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const readyAction = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_READY_CHANGED',
    );
    expect(readyAction).toBeDefined();

    const payload = (readyAction!.data as { payload: { userId: string; isReady: boolean } }).payload;
    expect(payload.userId).toBe(MOCK_USERS.alice.userId);
    expect(payload.isReady).toBe(true);
  });

  it('should reject ready toggle from user not in a lobby', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should reject ready toggle from spectator', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
    callEvent(socketC, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should trigger AUTO_START_TRIGGERED when threshold is met', () => {
    // Set auto-start threshold to 2
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.settings.autoStartThreshold = 2;

    // Both players ready up
    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });
    callEvent(socketB, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const autoStart = actions.find(
      (a) => (a.data as { type: string }).type === 'AUTO_START_TRIGGERED',
    );
    expect(autoStart).toBeDefined();
  });

  it('should not trigger AUTO_START when below threshold', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.settings.autoStartThreshold = 3;

    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });
    callEvent(socketB, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const autoStart = actions.find(
      (a) => (a.data as { type: string }).type === 'AUTO_START_TRIGGERED',
    );
    expect(autoStart).toBeUndefined();
  });

  it('should not trigger AUTO_START when threshold is null', () => {
    callEvent(socketA, 'rmhbox:lobby:toggle_ready', { lobbyId });
    callEvent(socketB, 'rmhbox:lobby:toggle_ready', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const autoStart = actions.find(
      (a) => (a.data as { type: string }).type === 'AUTO_START_TRIGGERED',
    );
    expect(autoStart).toBeUndefined();
  });
});
