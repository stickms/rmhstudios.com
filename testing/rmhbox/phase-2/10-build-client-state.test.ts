/**
 * Phase 2 — §10: Build Client State Tests
 *
 * Tests that buildClientState produces properly sanitized state,
 * no internal server data leaks, correct role assignment, and
 * proper host identification.
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
  handler![1](sock.socket, payload);
}

function createLobbyAndGetId(sock: MockSocketData): string {
  callEvent(sock, 'rmhbox:lobby:create', {});
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Build Client State (§10.1)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should return correct myRole for player', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    expect(state.myRole).toBe('player');
    expect(state.myUserId).toBe(MOCK_USERS.alice.userId);
  });

  it('should return correct myRole for spectator', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.charlie.userId);

    expect(state.myRole).toBe('spectator');
  });

  it('should mark the host player with isHost: true', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    const alicePlayer = state.players.find((p) => p.userId === MOCK_USERS.alice.userId);
    const bobPlayer = state.players.find((p) => p.userId === MOCK_USERS.bob.userId);

    expect(alicePlayer!.isHost).toBe(true);
    expect(bobPlayer!.isHost).toBe(false);
  });

  it('should not include socketId in client state players', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    for (const player of state.players) {
      expect(player).not.toHaveProperty('socketId');
      expect(player).not.toHaveProperty('lastSeenAt');
      expect(player).not.toHaveProperty('joinedAt');
    }
  });

  it('should not include socketId in client state spectators', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    for (const spectator of state.spectators) {
      expect(spectator).not.toHaveProperty('socketId');
      expect(spectator).not.toHaveProperty('joinedAt');
    }
  });

  it('should include lobby metadata correctly', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    expect(state.lobbyId).toBe(lobbyId);
    expect(state.hostUserId).toBe(MOCK_USERS.alice.userId);
    expect(state.state).toBe('WAITING');
    expect(state.roundNumber).toBe(0);
    expect(state.currentGame).toBeNull();
    expect(state.matchHistory).toEqual([]);
  });

  it('should include settings as a copy (no mutation)', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    // Mutate the returned settings
    state.settings.maxPlayers = 999;

    // Original should not be affected
    expect(lobby.settings.maxPlayers).not.toBe(999);
  });

  it('should include chat messages', () => {
    callEvent(socketA, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    lobbyManager.addSystemChat(lobbyId, 'Welcome!');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    expect(state.chat.length).toBeGreaterThan(0);
  });

  it('should include seq counter', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    expect(typeof state.seq).toBe('number');
  });

  it('should return all players in the players array', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);

    expect(state.players).toHaveLength(2);
    expect(state.players.map((p) => p.userId)).toContain(MOCK_USERS.alice.userId);
    expect(state.players.map((p) => p.userId)).toContain(MOCK_USERS.bob.userId);
  });

  it('should include player score and ready status', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    player.score = 100;
    player.isReady = true;

    const state = lobbyManager.buildClientState(lobby, MOCK_USERS.alice.userId);
    const aliceClient = state.players.find((p) => p.userId === MOCK_USERS.alice.userId)!;

    expect(aliceClient.score).toBe(100);
    expect(aliceClient.isReady).toBe(true);
  });
});
