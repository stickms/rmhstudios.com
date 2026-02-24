/**
 * Phase 2 — §14: Integration & Edge Case Tests
 *
 * End-to-end lobby lifecycle test and edge case scenarios.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
import type { ClientLobbyState } from '../../../lib/rmhbox/types';

let serverData: MockServerData;
let lobbyManager: LobbyManager;
let chatHandler: ChatHandler;

beforeEach(() => {
  vi.useFakeTimers();
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
  chatHandler = new ChatHandler(serverData.server as unknown as Server, lobbyManager);
});

afterEach(() => {
  lobbyManager.stopGarbageCollector();
  vi.useRealTimers();
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

// ─── §14.1: Full Lifecycle Test ─────────────────────────────────

describe('End-to-End Lobby Lifecycle (§14.1)', () => {
  it('should complete a full lobby lifecycle', () => {
    // 1. Socket A creates a lobby
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);
    expect(lobbyId).toHaveLength(6);

    // 2. Socket B joins the lobby
    const socketB = setupSocket(MOCK_USERS.bob);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    const snapshot = findLastEmitted(socketB.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshot).toBeDefined();
    expect((snapshot!.data as ClientLobbyState).players).toHaveLength(2);

    // Verify Socket A received PLAYER_JOINED
    const joinActions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const joinAction = joinActions.find((a) => (a.data as { type: string }).type === 'PLAYER_JOINED');
    expect(joinAction).toBeDefined();

    // 3. Socket A sends a chat message
    callEvent(socketA, 'rmhbox:lobby:chat', { lobbyId, content: 'Hello everyone!' });
    const chatActions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const chatAction = chatActions.find(
      (a) => (a.data as { type: string }).type === 'CHAT_MESSAGE'
        && (a.data as { payload: { type: string } }).payload.type === 'user',
    );
    expect(chatAction).toBeDefined();

    // 4. Host picks a game so players can ready up
    callEvent(socketA, 'rmhbox:game:pick', { lobbyId, minigameId: 'rhyme-time' });

    // 5. Socket B toggles ready
    callEvent(socketB, 'rmhbox:lobby:toggle_ready', { lobbyId });
    const readyActions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const readyAction = readyActions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_READY_CHANGED',
    );
    expect(readyAction).toBeDefined();

    // 6. Socket A (host) kicks Socket B
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const targetSocket = serverData.registeredSockets.get(socketB.socket.id);
    expect(targetSocket?.emit).toHaveBeenCalledWith(S2C.LOBBY_KICKED, expect.objectContaining({ reason: 'Kicked by host' }));

    const kickActions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const kickAction = kickActions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_KICKED',
    );
    expect(kickAction).toBeDefined();

    // 6. Socket B joins again (should succeed since they were kicked but not banned)
    // Need to re-register Socket B
    const socketB2 = setupSocket(MOCK_USERS.bob);
    callEvent(socketB2, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    const snapshot2 = findLastEmitted(socketB2.emitted, S2C.LOBBY_STATE_SNAPSHOT);
    expect(snapshot2).toBeDefined();

    // 7. Socket A transfers host to Socket B
    callEvent(socketA, 'rmhbox:lobby:transfer_host', { lobbyId, targetUserId: MOCK_USERS.bob.userId });
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.hostUserId).toBe(MOCK_USERS.bob.userId);

    // 8. Socket B (now host) updates settings
    callEvent(socketB2, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { isPublic: true, maxPlayers: 4 },
    });
    expect(lobby.settings.isPublic).toBe(true);
    expect(lobby.settings.maxPlayers).toBe(4);

    // 9. Socket A leaves
    callEvent(socketA, 'rmhbox:lobby:leave', { lobbyId });
    expect(lobby.players.has(MOCK_USERS.alice.userId)).toBe(false);

    // 10. Socket B leaves — lobby should be disbanded
    callEvent(socketB2, 'rmhbox:lobby:leave', { lobbyId });
    expect(lobbyManager.getLobby(lobbyId)).toBeUndefined();
    expect(lobbyManager.getLobbies().size).toBe(0);
  });
});

// ─── §14.2: Edge Cases ──────────────────────────────────────────

describe('Edge Cases (§14.2)', () => {
  it('should return LOBBY_NOT_FOUND for non-existent lobby join', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    callEvent(socketA, 'rmhbox:lobby:join', { lobbyId: 'NOEXIST', asSpectator: false });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_NOT_FOUND');
  });

  it('should return ALREADY_IN_LOBBY when creating while in a lobby', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    createLobbyAndGetId(socketA);

    // Try to create another
    callEvent(socketA, 'rmhbox:lobby:create', {});

    const errors = socketA.emitted.filter(
      (e) => e.event === S2C.ERROR && (e.data as { code: string }).code === 'ALREADY_IN_LOBBY',
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should return NOT_HOST for non-host kick attempt', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);
    const socketB = setupSocket(MOCK_USERS.bob);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Bob tries to kick Alice
    callEvent(socketB, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.alice.userId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should handle multiple players joining and leaving without crashes', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);

    // 10 players join and leave
    for (let i = 0; i < 10; i++) {
      const user = {
        userId: `user-stress-${i}`,
        userName: `Stress${i}`,
        avatarUrl: null,
        sessionToken: `token-stress-${i}`,
        expiresAt: new Date(Date.now() + 86400_000),
      };
      const sock = setupSocket(user);
      callEvent(sock, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
      callEvent(sock, 'rmhbox:lobby:leave', { lobbyId });
    }

    // Alice should still be in the lobby
    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.alice.userId)).toBe(true);
  });

  it('should handle disconnect and reconnect scenario correctly', () => {
    const socketA = setupSocket(MOCK_USERS.alice);
    const lobbyId = createLobbyAndGetId(socketA);
    const socketB = setupSocket(MOCK_USERS.bob);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });

    // Socket B disconnects
    lobbyManager.handleDisconnect(socketB.socket as unknown as Socket);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.get(MOCK_USERS.bob.userId)!.isConnected).toBe(false);

    // Cancel grace timer (simulating reconnection)
    lobbyManager.cancelGraceTimer(MOCK_USERS.bob.userId);

    // Player should still be there after grace period
    vi.advanceTimersByTime(130_000);
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(true);
  });

  it('should handle rapid create-leave cycles', () => {
    for (let i = 0; i < 5; i++) {
      const user = {
        userId: `user-rapid-${i}`,
        userName: `Rapid${i}`,
        avatarUrl: null,
        sessionToken: `token-rapid-${i}`,
        expiresAt: new Date(Date.now() + 86400_000),
      };
      const sock = setupSocket(user);
      const lid = createLobbyAndGetId(sock);
      callEvent(sock, 'rmhbox:lobby:leave', { lobbyId: lid });
    }

    // All lobbies should be cleaned up
    expect(lobbyManager.getLobbies().size).toBe(0);
  });

  it('should not crash when disconnecting a user not in any lobby', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    // Charlie is not in any lobby
    expect(() => {
      lobbyManager.handleDisconnect(socketC.socket as unknown as Socket);
    }).not.toThrow();
  });
});
