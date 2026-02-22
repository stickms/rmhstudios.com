/**
 * Phase 2 — §12: Helper Methods Tests
 *
 * Tests lookup methods and broadcasting helpers on LobbyManager.
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
import type { GameAction } from '../../../lib/rmhbox/types';

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

// ─── §12.1: Lookup Methods ──────────────────────────────────────

describe('Lookup Methods (§12.1)', () => {
  let socketA: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    lobbyId = createLobbyAndGetId(socketA);
  });

  it('getLobby should return the lobby by ID', () => {
    const lobby = lobbyManager.getLobby(lobbyId);
    expect(lobby).toBeDefined();
    expect(lobby!.id).toBe(lobbyId);
  });

  it('getLobbyByUserId should return lobby for a player', () => {
    const lobby = lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId);
    expect(lobby).toBeDefined();
    expect(lobby!.id).toBe(lobbyId);
  });

  it('findLobbyByUserId should be an alias for getLobbyByUserId', () => {
    const lobby1 = lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId);
    const lobby2 = lobbyManager.findLobbyByUserId(MOCK_USERS.alice.userId);
    expect(lobby1).toBe(lobby2);
  });

  it('getLobbyBySocketId should find lobby by socket ID', () => {
    const lobby = lobbyManager.getLobbyBySocketId(socketA.socket.id);
    expect(lobby).toBeDefined();
    expect(lobby!.id).toBe(lobbyId);
  });

  it('getLobbyBySocketId should return undefined for unknown socket', () => {
    expect(lobbyManager.getLobbyBySocketId('unknown-socket')).toBeUndefined();
  });

  it('getLobbyByUserId should return undefined after user leaves', () => {
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });
    expect(lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId)).toBeUndefined();
  });

  it('getLobbyByUserId should work for spectators', () => {
    const socketB = setupSocket(MOCK_USERS.bob);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    const lobby = lobbyManager.getLobbyByUserId(MOCK_USERS.bob.userId);
    expect(lobby).toBeDefined();
    expect(lobby!.id).toBe(lobbyId);
  });
});

// ─── §12.2: Broadcasting Methods ────────────────────────────────

describe('Broadcasting Methods (§12.2)', () => {
  let socketA: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    lobbyId = createLobbyAndGetId(socketA);
  });

  it('broadcastAction should emit to lobby room with auto-seq', () => {
    lobbyManager.broadcastAction(lobbyId, { type: 'TEST_ACTION', payload: { foo: 'bar' } });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    expect(actions.length).toBeGreaterThanOrEqual(1);

    const action = actions[actions.length - 1].data as GameAction;
    expect(action.type).toBe('TEST_ACTION');
    expect(action.seq).toBeGreaterThan(0);
    expect(action.timestamp).toBeGreaterThan(0);
  });

  it('broadcastAction should increment seq on each call', () => {
    lobbyManager.broadcastAction(lobbyId, { type: 'ACTION_1' });
    lobbyManager.broadcastAction(lobbyId, { type: 'ACTION_2' });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const seqs = actions.map((a) => (a.data as GameAction).seq);
    // Later actions should have higher seq
    const testSeqs = seqs.slice(-2);
    expect(testSeqs[1]).toBeGreaterThan(testSeqs[0]);
  });

  it('broadcastToPlayers should emit to players room', () => {
    lobbyManager.broadcastToPlayers(lobbyId, 'test:event', { data: 'players' });

    const events = findServerEmitted(serverData.emitted, 'test:event', `lobby:${lobbyId}:players`);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('broadcastToSpectators should emit to spectators room', () => {
    lobbyManager.broadcastToSpectators(lobbyId, 'test:event', { data: 'spectators' });

    const events = findServerEmitted(serverData.emitted, 'test:event', `lobby:${lobbyId}:spectators`);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('sendToPlayer should emit to specific player room', () => {
    lobbyManager.sendToPlayer(lobbyId, MOCK_USERS.alice.userId, 'test:event', { data: 'alice' });

    const events = findServerEmitted(
      serverData.emitted,
      'test:event',
      `lobby:${lobbyId}:player:${MOCK_USERS.alice.userId}`,
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('addSystemChat should add system message and broadcast', () => {
    lobbyManager.addSystemChat(lobbyId, 'Hello system');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const sysMsg = lobby.chat.find((m) => m.content === 'Hello system');
    expect(sysMsg).toBeDefined();
    expect(sysMsg!.type).toBe('system');

    // Should also broadcast via action
    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const chatAction = actions.find(
      (a) => (a.data as { type: string }).type === 'CHAT_MESSAGE',
    );
    expect(chatAction).toBeDefined();
  });
});
