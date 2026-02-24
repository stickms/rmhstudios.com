/**
 * Phase 2 — §6: Chat System Tests
 *
 * Tests chat messaging, sanitization, ring buffer history,
 * system messages, and error handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { ChatHandler } from '../../../server/rmhbox/chat';
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
let chatHandler: ChatHandler;

beforeEach(() => {
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  chatHandler = new ChatHandler(serverData.server as unknown as Server, lobbyManager);
});

function setupSocket(user: typeof MOCK_USERS.alice): MockSocketData {
  const sock = createMockSocket(user);
  registerSocket(serverData, sock);
  lobbyManager.handleConnection(sock.socket as unknown as Socket);
  chatHandler.handleConnection(sock.socket as unknown as Socket);
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

describe('Chat System (§6.1)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should send a chat message that is broadcast to the lobby', () => {
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Hello, world!' });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const chatAction = actions.find(
      (a) => (a.data as { type: string }).type === 'CHAT_MESSAGE'
        && (a.data as { payload: { type: string } }).payload.type === 'user',
    );
    expect(chatAction).toBeDefined();

    const msg = (chatAction!.data as { payload: { content: string; userId: string; userName: string } }).payload;
    expect(msg.content).toBe('Hello, world!');
    expect(msg.userId).toBe(MOCK_USERS.alice.userId);
    expect(msg.userName).toBe('Alice');
  });

  it('should store chat messages in lobby history', () => {
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Message 1' });
    callEvent(socketB, 'rmhbox:lobby:chat', { lobbyId, content: 'Message 2' });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const userMsgs = lobby.chat.filter((m) => m.type === 'user');
    expect(userMsgs.length).toBe(2);
    expect(userMsgs[0].content).toBe('Message 1');
    expect(userMsgs[1].content).toBe('Message 2');
  });

  it('should strip HTML tags from chat messages', () => {
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: '<script>alert("xss")</script>' });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const userMsgs = lobby.chat.filter((m) => m.type === 'user');
    const msg = userMsgs[userMsgs.length - 1];
    expect(msg.content).not.toContain('<');
    expect(msg.content).not.toContain('>');
  });

  it('should enforce ring buffer with CHAT_HISTORY_LENGTH limit', () => {
    // Send 105 messages (history length is 100)
    for (let i = 0; i < 105; i++) {
      callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: `Message ${i}` });
    }

    const lobby = lobbyManager.getLobby(lobbyId)!;
    // Should contain user messages plus any system messages, capped at 100
    expect(lobby.chat.length).toBeLessThanOrEqual(100);
  });

  it('should reject chat from user not in a lobby', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:chat', { lobbyId, content: 'Hello' });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect(error).toBeDefined();
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should allow spectators to chat', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
    callEvent(socketC, 'rmhbox:lobby:chat', { lobbyId, content: 'Spectator message' });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const userMsgs = lobby.chat.filter((m) => m.type === 'user');
    expect(userMsgs.some((m) => m.content === 'Spectator message')).toBe(true);
  });

  it('should assign unique IDs to chat messages', () => {
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Msg 1' });
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Msg 2' });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const userMsgs = lobby.chat.filter((m) => m.type === 'user');
    const ids = userMsgs.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include timestamp in chat messages', () => {
    const before = Date.now();
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Timestamped' });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const userMsgs = lobby.chat.filter((m) => m.type === 'user');
    const msg = userMsgs[userMsgs.length - 1];
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('should update lastActivityAt on chat', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const before = lobby.lastActivityAt;

    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Activity' });

    expect(lobby.lastActivityAt).toBeGreaterThanOrEqual(before);
  });
});

describe('System Chat (§6.1)', () => {
  it('should create system chat messages via addSystemChat', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    lobbyManager.addSystemChat(lobbyId, 'Test system message');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsgs = lobby.chat.filter((m) => m.type === 'system');
    expect(systemMsgs.some((m) => m.content === 'Test system message')).toBe(true);
  });

  it('should set userId to "system" for system messages', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    lobbyManager.addSystemChat(lobbyId, 'System says hello');

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsg = lobby.chat.find((m) => m.content === 'System says hello');
    expect(systemMsg!.userId).toBe('system');
    expect(systemMsg!.userName).toBe('System');
  });
});
