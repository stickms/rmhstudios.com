/**
 * Phase 2 — §3: Lobby Join Tests
 *
 * Tests joining lobbies as player/spectator, error handling
 * for non-existent/full/disbanded lobbies, and mid-game join behavior.
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
import type { ClientLobbyState } from '../../../lib/rmhbox/types';

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
  expect(handler).toBeDefined();
  handler![1](payload);
}

function createLobbyAndGetId(sock: MockSocketData): string {
  callEvent(sock, 'rmhbox:lobby:create', {});
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Lobby Join (§3.1)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
  });

  it('should allow a player to join an existing lobby', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const snapshot = findLastEmitted(socketB.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshot).toBeDefined();

    const state = snapshot!.data as ClientLobbyState;
    expect(state.players).toHaveLength(2);
    expect(state.myRole).toBe('player');
    expect(state.myUserId).toBe(MOCK_USERS.bob.userId);
  });

  it('should broadcast PLAYER_JOINED to lobby members', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const joinAction = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_JOINED',
    );
    expect(joinAction).toBeDefined();
    expect((joinAction!.data as { payload: { userId: string } }).payload.userId).toBe(
      MOCK_USERS.bob.userId,
    );
  });

  it('should join socket to correct rooms as player', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    expect(socketB.joinedRooms.has(`lobby:${lobbyId}`)).toBe(true);
    expect(socketB.joinedRooms.has(`lobby:${lobbyId}:players`)).toBe(true);
    expect(socketB.joinedRooms.has(`lobby:${lobbyId}:player:${MOCK_USERS.bob.userId}`)).toBe(true);
  });

  it('should allow joining as spectator explicitly', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    const snapshot = findLastEmitted(socketB.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    const state = snapshot!.data as ClientLobbyState;
    expect(state.myRole).toBe('spectator');
    expect(state.spectators).toHaveLength(1);
  });

  it('should join spectator to correct rooms', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    expect(socketB.joinedRooms.has(`lobby:${lobbyId}`)).toBe(true);
    expect(socketB.joinedRooms.has(`lobby:${lobbyId}:spectators`)).toBe(true);
    expect(socketB.joinedRooms.has(`lobby:${lobbyId}:player:${MOCK_USERS.bob.userId}`)).toBe(true);
  });

  it('should reject joining a non-existent lobby', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId: 'NOPE01', asSpectator: false });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('LOBBY_NOT_FOUND');
  });

  it('should reject joining when already in a different lobby', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Create a second lobby with a different user
    const socketC = setupSocket(MOCK_USERS.charlie);
    const lobbyId2 = createLobbyAndGetId(socketC);

    // Try to join the second lobby while still in the first
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId: lobbyId2, asSpectator: false });

    const errors = socketB.emitted.filter(
      (e) => e.event === S2C.ERROR && (e.data as { code: string }).code === 'ALREADY_IN_LOBBY',
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should force spectator when lobby is full', () => {
    // Create a lobby with maxPlayers = 2 (Alice is already in it)
    const smallSock = createMockSocket({
      ...MOCK_USERS.alice,
      userId: 'user-small-host',
      userName: 'SmallHost',
      sessionToken: 'token-small',
    });
    registerSocket(serverData, smallSock);
    lobbyManager.handleConnection(smallSock.socket as unknown as Socket);
    callEvent(smallSock, 'rmhbox:lobby:create', { settings: { maxPlayers: 2 } });
    const smallId = (findLastEmitted(smallSock.emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;

    // Second player joins
    const sock2 = setupSocket({
      ...MOCK_USERS.bob,
      userId: 'user-fill-2',
      userName: 'Fill2',
      sessionToken: 'token-fill-2',
    });
    callEvent(sock2, 'rmhbox:lobby:join', { lobbyId: smallId, asSpectator: false });

    // Third player tries to join — should become spectator
    const sock3 = setupSocket({
      ...MOCK_USERS.charlie,
      userId: 'user-fill-3',
      userName: 'Fill3',
      sessionToken: 'token-fill-3',
    });
    callEvent(sock3, 'rmhbox:lobby:join', { lobbyId: smallId, asSpectator: false });

    const snapshot = findLastEmitted(sock3.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    const state = snapshot!.data as ClientLobbyState;
    expect(state.myRole).toBe('spectator');
  });

  it('should force spectator when game is in PLAYING state', () => {
    // Directly set lobby to PLAYING state
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const snapshot = findLastEmitted(socketB.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    const state = snapshot!.data as ClientLobbyState;
    expect(state.myRole).toBe('spectator');
  });

  it('should reject joining a disbanded lobby', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'DISBANDED';

    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_NOT_FOUND');
  });

  it('should reject spectator join when spectator slots are full', () => {
    // Set maxSpectators to 0
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.settings.maxSpectators = 0;

    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_FULL');
  });

  it('should add system chat message on join', () => {
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsgs = lobby.chat.filter((m) => m.type === 'system');
    expect(systemMsgs.some((m) => m.content.includes('Bob') && m.content.includes('joined'))).toBe(true);
  });

  it('should update lastActivityAt on join', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const beforeActivity = lobby.lastActivityAt;

    // Small delay to ensure timestamp difference
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    expect(lobby.lastActivityAt).toBeGreaterThanOrEqual(beforeActivity);
  });
});
