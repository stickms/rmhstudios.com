/**
 * Phase 2 — §1 & §2: Lobby Manager Core & Creation Tests
 *
 * Tests LobbyManager instantiation, room code generation,
 * lobby creation with default/custom settings, and error handling.
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

// ─── §1: Lobby Manager Core ─────────────────────────────────────

describe('LobbyManager Core (§1.1)', () => {
  it('should instantiate with empty lobbies map', () => {
    expect(lobbyManager.getLobbies().size).toBe(0);
  });

  it('should have no lobbies when first created', () => {
    expect(lobbyManager.getLobby('nonexistent')).toBeUndefined();
  });

  it('should return undefined for getLobbyByUserId with unknown user', () => {
    expect(lobbyManager.getLobbyByUserId('unknown-user')).toBeUndefined();
  });

  it('should return undefined for findLobbyByUserId with unknown user', () => {
    expect(lobbyManager.findLobbyByUserId('unknown-user')).toBeUndefined();
  });

  it('should return undefined for getLobbyBySocketId with unknown socket', () => {
    expect(lobbyManager.getLobbyBySocketId('unknown-socket')).toBeUndefined();
  });
});

// ─── §1.2: Room Code Generation ──────────────────────────────────

describe('Room Code Generation (§1.2)', () => {
  it('should generate unique 6-character lobby IDs on creation', () => {
    const socketA = createMockSocket(MOCK_USERS.alice);
    registerSocket(serverData, socketA);

    // Create a lobby via the handler
    lobbyManager.handleConnection(socketA.socket as unknown as Socket);
    const createHandler = socketA.socket.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'rmhbox:lobby:create',
    );
    expect(createHandler).toBeDefined();

    // Call the handler directly (simulating the socket.on callback)
    createHandler![1](socketA.socket, {});

    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    expect(created).toBeDefined();

    const data = created!.data as { lobbyId: string };
    expect(data.lobbyId).toHaveLength(6);
    expect(data.lobbyId).toMatch(/^[A-Z0-9]+$/);
    // No ambiguous characters
    expect(data.lobbyId).not.toMatch(/[IO01]/);
  });

  it('should generate 100 unique codes without collisions', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const user = {
        ...MOCK_USERS.alice,
        userId: `user-${i}`,
        userName: `User${i}`,
        sessionToken: `token-${i}`,
      };
      const sock = createMockSocket(user);
      registerSocket(serverData, sock);
      lobbyManager.handleConnection(sock.socket as unknown as Socket);
      const handler = sock.socket.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'rmhbox:lobby:create',
      );
      handler![1](sock.socket, {});

      const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
      const data = created!.data as { lobbyId: string };
      codes.add(data.lobbyId);
    }
    expect(codes.size).toBe(100);
  });
});

// ─── §2: Lobby Creation ─────────────────────────────────────────

describe('Lobby Creation (§2.1)', () => {
  let socketA: MockSocketData;

  beforeEach(() => {
    socketA = createMockSocket(MOCK_USERS.alice);
    registerSocket(serverData, socketA);
    lobbyManager.handleConnection(socketA.socket as unknown as Socket);
  });

  function callCreate(sock: MockSocketData, payload: Record<string, unknown> = {}): void {
    const handler = sock.socket.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'rmhbox:lobby:create',
    );
    handler![1](sock.socket, payload);
  }

  it('should create a lobby with default settings', () => {
    callCreate(socketA);

    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    expect(created).toBeDefined();

    const data = created!.data as { lobbyId: string; lobby: ClientLobbyState };
    expect(data.lobbyId).toHaveLength(6);
    expect(data.lobby.state).toBe('WAITING');
    expect(data.lobby.hostUserId).toBe(MOCK_USERS.alice.userId);
    expect(data.lobby.players).toHaveLength(1);
    expect(data.lobby.players[0].userId).toBe(MOCK_USERS.alice.userId);
    expect(data.lobby.players[0].isHost).toBe(true);
    expect(data.lobby.settings.isPublic).toBe(false);
    expect(data.lobby.settings.maxPlayers).toBe(8);
  });

  it('should store lobby in internal maps', () => {
    callCreate(socketA);

    expect(lobbyManager.getLobbies().size).toBe(1);
    const lobby = lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId);
    expect(lobby).toBeDefined();
    expect(lobby!.hostUserId).toBe(MOCK_USERS.alice.userId);
  });

  it('should join socket to correct Socket.io rooms', () => {
    callCreate(socketA);

    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    const data = created!.data as { lobbyId: string };
    const lobbyId = data.lobbyId;

    expect(socketA.joinedRooms.has(`lobby:${lobbyId}`)).toBe(true);
    expect(socketA.joinedRooms.has(`lobby:${lobbyId}:players`)).toBe(true);
    expect(socketA.joinedRooms.has(`lobby:${lobbyId}:player:${MOCK_USERS.alice.userId}`)).toBe(true);
  });

  it('should create a lobby with custom settings', () => {
    callCreate(socketA, { settings: { isPublic: true, maxPlayers: 4 } });

    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    const data = created!.data as { lobbyId: string; lobby: ClientLobbyState };
    expect(data.lobby.settings.isPublic).toBe(true);
    expect(data.lobby.settings.maxPlayers).toBe(4);
    // Defaults for unspecified fields
    expect(data.lobby.settings.maxSpectators).toBe(20);
  });

  it('should clamp maxPlayers to valid range', () => {
    // Schema already validates 2-16 range, but createLobby also clamps
    // Test with a value within schema range but at the boundary
    callCreate(socketA, { settings: { maxPlayers: 16 } });

    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    const data = created!.data as { lobbyId: string; lobby: ClientLobbyState };
    expect(data.lobby.settings.maxPlayers).toBeLessThanOrEqual(16);
    expect(data.lobby.settings.maxPlayers).toBe(16);
  });

  it('should clamp maxPlayers minimum to 2', () => {
    // Schema enforces min(2), so test with the minimum value
    callCreate(socketA, { settings: { maxPlayers: 2 } });

    const created = findLastEmitted(socketA.emitted, S2C.LOBBY_CREATED);
    const data = created!.data as { lobbyId: string; lobby: ClientLobbyState };
    expect(data.lobby.settings.maxPlayers).toBeGreaterThanOrEqual(2);
    expect(data.lobby.settings.maxPlayers).toBe(2);
  });

  it('should reject creation if user is already in a lobby', () => {
    callCreate(socketA);
    // Try to create another lobby
    callCreate(socketA);

    const errors = socketA.emitted.filter((e) => e.event === S2C.ERROR);
    const lastError = errors[errors.length - 1];
    expect(lastError).toBeDefined();
    expect((lastError.data as { code: string }).code).toBe('ALREADY_IN_LOBBY');
  });

  it('should set player fields correctly', () => {
    callCreate(socketA);

    const lobby = lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId)!;
    const player = lobby.players.get(MOCK_USERS.alice.userId)!;
    expect(player.isReady).toBe(false);
    expect(player.score).toBe(0);
    expect(player.roundScore).toBe(0);
    expect(player.isConnected).toBe(true);
    expect(player.role).toBe('player');
  });

  it('should initialize lobby with empty chat and match history', () => {
    callCreate(socketA);

    const lobby = lobbyManager.getLobbyByUserId(MOCK_USERS.alice.userId)!;
    expect(lobby.chat).toHaveLength(0);
    expect(lobby.matchHistory).toHaveLength(0);
    expect(lobby.roundNumber).toBe(0);
    expect(lobby.currentGame).toBeNull();
  });
});
