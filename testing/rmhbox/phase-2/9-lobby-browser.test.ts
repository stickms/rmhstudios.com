/**
 * Phase 2 — §9: Lobby Browser Tests
 *
 * Tests public lobby browsing, pagination, filtering,
 * and sorting by player count.
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
import type { PublicLobbyInfo } from '../../../lib/rmhbox/types';

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

function createLobbyWithSettings(
  userId: string,
  userName: string,
  settings: Record<string, unknown> = {},
): string {
  const user = { userId, userName, avatarUrl: null, sessionToken: `token-${userId}`, expiresAt: new Date(Date.now() + 86400_000) };
  const sock = setupSocket(user);
  callEvent(sock, 'rmhbox:lobby:create', { settings });
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Lobby Browser (§9.1)', () => {
  it('should return only public lobbies', () => {
    // Create 3 public and 2 private lobbies
    createLobbyWithSettings('user-pub-1', 'Pub1', { isPublic: true });
    createLobbyWithSettings('user-pub-2', 'Pub2', { isPublic: true });
    createLobbyWithSettings('user-pub-3', 'Pub3', { isPublic: true });
    createLobbyWithSettings('user-priv-1', 'Priv1', { isPublic: false });
    createLobbyWithSettings('user-priv-2', 'Priv2', { isPublic: false });

    // Browse from a new socket
    const browserSock = setupSocket({
      userId: 'user-browser',
      userName: 'Browser',
      avatarUrl: null,
      sessionToken: 'token-browser',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 20 });

    const result = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    expect(result).toBeDefined();

    const data = result!.data as { lobbies: PublicLobbyInfo[]; nextCursor: string | null };
    expect(data.lobbies).toHaveLength(3);
  });

  it('should not return disbanded lobbies', () => {
    const lobbyId = createLobbyWithSettings('user-disband', 'Disband', { isPublic: true });
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'DISBANDED';

    const browserSock = setupSocket({
      userId: 'user-browser-2',
      userName: 'Browser2',
      avatarUrl: null,
      sessionToken: 'token-browser-2',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 20 });

    const result = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data = result!.data as { lobbies: PublicLobbyInfo[] };
    expect(data.lobbies).toHaveLength(0);
  });

  it('should sort lobbies by player count descending', () => {
    // Create lobbies with different player counts
    const id1 = createLobbyWithSettings('user-sort-1', 'Sort1', { isPublic: true });
    const id2 = createLobbyWithSettings('user-sort-2', 'Sort2', { isPublic: true });
    createLobbyWithSettings('user-sort-3', 'Sort3', { isPublic: true });

    // Add extra players to lobby 2
    const extra1 = setupSocket({
      userId: 'user-extra-1',
      userName: 'Extra1',
      avatarUrl: null,
      sessionToken: 'token-extra-1',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    const extra2 = setupSocket({
      userId: 'user-extra-2',
      userName: 'Extra2',
      avatarUrl: null,
      sessionToken: 'token-extra-2',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    callEvent(extra1, 'rmhbox:lobby:join', { lobbyId: id2, asSpectator: false });
    callEvent(extra2, 'rmhbox:lobby:join', { lobbyId: id2, asSpectator: false });

    const browserSock = setupSocket({
      userId: 'user-browser-sort',
      userName: 'BrowserSort',
      avatarUrl: null,
      sessionToken: 'token-browser-sort',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 20 });

    const result = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data = result!.data as { lobbies: PublicLobbyInfo[] };

    // Lobby with 3 players should come first
    expect(data.lobbies[0].playerCount).toBeGreaterThanOrEqual(data.lobbies[1].playerCount);
  });

  it('should apply pagination with limit', () => {
    // Create 5 public lobbies
    for (let i = 0; i < 5; i++) {
      createLobbyWithSettings(`user-page-${i}`, `Page${i}`, { isPublic: true });
    }

    const browserSock = setupSocket({
      userId: 'user-browser-page',
      userName: 'BrowserPage',
      avatarUrl: null,
      sessionToken: 'token-browser-page',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    // Request only 2
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 2 });

    const result = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data = result!.data as { lobbies: PublicLobbyInfo[]; nextCursor: string | null };
    expect(data.lobbies).toHaveLength(2);
    expect(data.nextCursor).not.toBeNull();
  });

  it('should support cursor-based pagination', () => {
    // Create 5 public lobbies
    for (let i = 0; i < 5; i++) {
      createLobbyWithSettings(`user-cursor-${i}`, `Cursor${i}`, { isPublic: true });
    }

    const browserSock = setupSocket({
      userId: 'user-browser-cursor',
      userName: 'BrowserCursor',
      avatarUrl: null,
      sessionToken: 'token-browser-cursor',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    // First page
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 2 });
    const page1 = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data1 = page1!.data as { lobbies: PublicLobbyInfo[]; nextCursor: string | null };

    // Second page
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 2, cursor: data1.nextCursor! });
    const page2 = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data2 = page2!.data as { lobbies: PublicLobbyInfo[]; nextCursor: string | null };

    // No overlap between pages
    const ids1 = data1.lobbies.map((l) => l.lobbyId);
    const ids2 = data2.lobbies.map((l) => l.lobbyId);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('should include correct PublicLobbyInfo fields', () => {
    createLobbyWithSettings('user-fields', 'FieldHost', { isPublic: true });

    const browserSock = setupSocket({
      userId: 'user-browser-fields',
      userName: 'BrowserFields',
      avatarUrl: null,
      sessionToken: 'token-browser-fields',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 20 });

    const result = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data = result!.data as { lobbies: PublicLobbyInfo[] };
    const lobby = data.lobbies[0];

    expect(lobby).toHaveProperty('lobbyId');
    expect(lobby).toHaveProperty('hostName');
    expect(lobby).toHaveProperty('playerCount');
    expect(lobby).toHaveProperty('maxPlayers');
    expect(lobby).toHaveProperty('spectatorCount');
    expect(lobby).toHaveProperty('state');
    expect(lobby).toHaveProperty('currentGame');
    expect(lobby).toHaveProperty('roundNumber');
    expect(lobby.hostName).toBe('FieldHost');
    expect(lobby.playerCount).toBe(1);
  });

  it('should return empty array when no public lobbies exist', () => {
    const browserSock = setupSocket({
      userId: 'user-browser-empty',
      userName: 'BrowserEmpty',
      avatarUrl: null,
      sessionToken: 'token-browser-empty',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    callEvent(browserSock, 'rmhbox:lobby:browse', { limit: 20 });

    const result = findLastEmitted(browserSock.emitted, S2C.LOBBY_BROWSE_RESULT);
    const data = result!.data as { lobbies: PublicLobbyInfo[] };
    expect(data.lobbies).toHaveLength(0);
  });
});
