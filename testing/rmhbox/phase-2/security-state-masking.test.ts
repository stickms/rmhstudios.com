/**
 * Phase 2 — Security: State-Masking Verification
 *
 * Verifies that buildClientState properly sanitizes internal data,
 * Player A cannot see Player B's hidden internal fields,
 * and no server-only data leaks to clients.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { S2C } from '../../../lib/rmhbox/events';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  findLastEmitted,
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
  handler![1](payload);
}

function createLobbyAndGetId(sock: MockSocketData): string {
  callEvent(sock, 'rmhbox:lobby:create', {});
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Security: Phase 2 State-Masking', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let socketC: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    socketC = setupSocket(MOCK_USERS.charlie);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
  });

  it('should not expose socketId in player client state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const stateForAlice = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    for (const player of stateForAlice.players) {
      expect(player).not.toHaveProperty('socketId');
    }
  });

  it('should not expose socketId in spectator client state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const stateForAlice = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    for (const spectator of stateForAlice.spectators) {
      expect(spectator).not.toHaveProperty('socketId');
    }
  });

  it('should not expose internal timestamps (joinedAt, lastSeenAt) in client state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    for (const player of state.players) {
      expect(player).not.toHaveProperty('joinedAt');
      expect(player).not.toHaveProperty('lastSeenAt');
    }

    for (const spectator of state.spectators) {
      expect(spectator).not.toHaveProperty('joinedAt');
    }
  });

  it('should not expose internal role field in client player state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    for (const player of state.players) {
      expect(player).not.toHaveProperty('role');
    }
  });

  it('should not expose createdAt or lastActivityAt in client state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    // ClientLobbyState should not have these internal fields
    const raw = state as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty('createdAt');
    expect(raw).not.toHaveProperty('lastActivityAt');
  });

  it('should scope myRole correctly — Player A sees "player", Spectator C sees "spectator"', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;

    const stateA = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    expect(stateA.myRole).toBe('player');
    expect(stateA.myUserId).toBe(MOCK_USERS.alice.userId);

    const stateC = lobbyManager.buildClientState(lobby, MOCK_USERS.charlie.userId);
    expect(stateC.myRole).toBe('spectator');
    expect(stateC.myUserId).toBe(MOCK_USERS.charlie.userId);
  });

  it('should not expose Map objects in client state (only arrays)', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    // Players should be an array, not a Map
    expect(Array.isArray(state.players)).toBe(true);
    expect(Array.isArray(state.spectators)).toBe(true);
    expect(Array.isArray(state.chat)).toBe(true);
    expect(Array.isArray(state.matchHistory)).toBe(true);
  });

  it('should return a copy of settings (not a reference to internal object)', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    // Modify the client-side settings
    state.settings.maxPlayers = 999;

    // Internal settings should be unchanged
    expect(lobby.settings.maxPlayers).not.toBe(999);
  });

  it('should return a copy of chat (not a reference to internal array)', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobbyManager.addSystemChat(lobbyId, 'Test');

    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    const origLen = lobby.chat.length;

    // Modify the client-side chat
    state.chat.push({ id: 'fake', userId: 'x', userName: 'x', content: 'x', timestamp: 0, type: 'user' });

    // Internal chat should be unchanged
    expect(lobby.chat.length).toBe(origLen);
  });

  it('state snapshot sent on join should not contain internal server data', () => {
    // Check the snapshot sent to Bob when he joined
    const snapshot = findLastEmitted(socketB.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshot).toBeDefined();

    const state = snapshot!.data as ClientLobbyState;

    // Verify no internal fields
    for (const player of state.players) {
      expect(player).not.toHaveProperty('socketId');
      expect(player).not.toHaveProperty('joinedAt');
      expect(player).not.toHaveProperty('lastSeenAt');
      expect(player).not.toHaveProperty('role');
    }

    for (const spectator of state.spectators) {
      expect(spectator).not.toHaveProperty('socketId');
      expect(spectator).not.toHaveProperty('joinedAt');
    }
  });

  it('lobby creation response should not contain internal server data', () => {
    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    expect(created).toBeDefined();

    const data = created!.data as { lobby: ClientLobbyState };
    const state = data.lobby;

    for (const player of state.players) {
      expect(player).not.toHaveProperty('socketId');
      expect(player).not.toHaveProperty('joinedAt');
      expect(player).not.toHaveProperty('lastSeenAt');
    }
  });
});
