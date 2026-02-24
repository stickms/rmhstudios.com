/**
 * Phase 2 — §5: Host Controls Tests
 *
 * Tests kick, transfer host, update settings, and end session.
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
  handler![1](payload);
}

function createLobbyAndGetId(sock: MockSocketData): string {
  callEvent(sock, 'rmhbox:lobby:create', {});
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

// ─── §5.1: Kick Player ──────────────────────────────────────────

describe('Kick Player (§5.1)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should allow host to kick a player', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.bob.userId)).toBe(false);
  });

  it('should emit kicked event to the kicked player', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    // The kicked event is sent to the target socket directly
    const targetSocket = serverData.registeredSockets.get(socketB.socket.id);
    expect(targetSocket?.emit).toHaveBeenCalledWith(S2C.LOBBY_KICKED, { reason: 'Kicked by host' });
  });

  it('should broadcast PLAYER_KICKED action', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const kickAction = actions.find(
      (a) => (a.data as { type: string }).type === 'PLAYER_KICKED',
    );
    expect(kickAction).toBeDefined();
  });

  it('should reject kick from non-host', () => {
    callEvent(socketB, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.alice.userId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should reject host kicking themselves', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.alice.userId });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('should reject kick of non-existent player', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: 'nonexistent' });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should add system chat message on kick', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsgs = lobby.chat.filter((m) => m.type === 'system');
    expect(systemMsgs.some((m) => m.content.includes('kicked'))).toBe(true);
  });

  it('should remove kicked user from userToLobby', () => {
    callEvent(socketA, 'rmhbox:lobby:kick', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    expect(lobbyManager.getLobbyByUserId(MOCK_USERS.bob.userId)).toBeUndefined();
  });
});

// ─── §5.2: Transfer Host ────────────────────────────────────────

describe('Transfer Host (§5.2)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should transfer host to target player', () => {
    callEvent(socketA, 'rmhbox:lobby:transfer_host', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.hostUserId).toBe(MOCK_USERS.bob.userId);
  });

  it('should broadcast HOST_TRANSFERRED action', () => {
    callEvent(socketA, 'rmhbox:lobby:transfer_host', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const transferAction = actions.find(
      (a) => (a.data as { type: string }).type === 'HOST_TRANSFERRED',
    );
    expect(transferAction).toBeDefined();
    expect(
      (transferAction!.data as { payload: { newHostUserId: string } }).payload.newHostUserId,
    ).toBe(MOCK_USERS.bob.userId);
  });

  it('should reject transfer from non-host', () => {
    callEvent(socketB, 'rmhbox:lobby:transfer_host', { lobbyId, targetUserId: MOCK_USERS.alice.userId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should reject transfer to non-player', () => {
    callEvent(socketA, 'rmhbox:lobby:transfer_host', { lobbyId, targetUserId: 'nonexistent' });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should add system chat on transfer', () => {
    callEvent(socketA, 'rmhbox:lobby:transfer_host', { lobbyId, targetUserId: MOCK_USERS.bob.userId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsgs = lobby.chat.filter((m) => m.type === 'system');
    expect(systemMsgs.some((m) => m.content.includes('Host transferred') && m.content.includes('Bob'))).toBe(true);
  });
});

// ─── §5.3: Update Settings ──────────────────────────────────────

describe('Update Settings (§5.3)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should update lobby settings', () => {
    callEvent(socketA, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { isPublic: true, maxPlayers: 4 },
    });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.settings.isPublic).toBe(true);
    expect(lobby.settings.maxPlayers).toBe(4);
  });

  it('should broadcast SETTINGS_UPDATED action', () => {
    callEvent(socketA, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { isPublic: true },
    });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const settingsAction = actions.find(
      (a) => (a.data as { type: string }).type === 'SETTINGS_UPDATED',
    );
    expect(settingsAction).toBeDefined();
  });

  it('should reject settings update from non-host', () => {
    callEvent(socketB, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { isPublic: true },
    });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should reject settings update during PLAYING state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    callEvent(socketA, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { isPublic: true },
    });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_IN_GAME');
  });

  it('should clamp maxPlayers within valid range', () => {
    callEvent(socketA, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { maxPlayers: 999 },
    });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.settings.maxPlayers).toBeLessThanOrEqual(16);
  });

  it('should clamp maxSpectators within valid range', () => {
    callEvent(socketA, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { maxSpectators: -5 },
    });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.settings.maxSpectators).toBeGreaterThanOrEqual(0);
  });

  it('should preserve unmodified settings', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    const originalAllowMidGame = lobby.settings.allowMidGameJoin;

    callEvent(socketA, 'rmhbox:lobby:update_settings', {
      lobbyId,
      settings: { isPublic: true },
    });

    expect(lobby.settings.allowMidGameJoin).toBe(originalAllowMidGame);
  });
});

// ─── §5.4: End Session ──────────────────────────────────────────

describe('End Session (§5.4)', () => {
  let socketA: MockSocketData;
  let socketB: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    socketB = setupSocket(MOCK_USERS.bob);
    lobbyId = createLobbyAndGetId(socketA);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
  });

  it('should transition lobby to SESSION_RESULTS state', () => {
    callEvent(socketA, 'rmhbox:lobby:end_session', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('SESSION_RESULTS');
  });

  it('should emit session results to all players', () => {
    callEvent(socketA, 'rmhbox:lobby:end_session', { lobbyId });

    const results = findServerEmitted(serverData.emitted, S2C.GAME_SESSION_RESULTS, `lobby:${lobbyId}`);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should disband lobby after delay', () => {
    callEvent(socketA, 'rmhbox:lobby:end_session', { lobbyId });

    // Advance past the disband delay (15s)
    vi.advanceTimersByTime(16_000);

    expect(lobbyManager.getLobby(lobbyId)).toBeUndefined();
  });

  it('should reject end session from non-host', () => {
    callEvent(socketB, 'rmhbox:lobby:end_session', { lobbyId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_HOST');
  });

  it('should reject end session when not in a lobby', () => {
    const socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:end_session', { lobbyId });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });
});
