/**
 * RMHbox Phase 2 — Test Setup
 *
 * Extends Phase 1 setup with lobby-specific mock factories.
 * Provides enhanced mock Socket.io server with room-based emit tracking,
 * mock sockets with room management, and helper functions for lobby tests.
 *
 * Environment-agnostic: no real DB or network connections required.
 */

import { vi } from 'vitest';
import type { RMHboxPlayer, RMHboxSpectator, RMHboxLobby } from '../../../server/rmhbox/types';
import type { LobbySettings } from '../../../lib/rmhbox/types';

// ─── Mock User Data (re-exported from Phase 1) ──────────────────

export interface MockUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  sessionToken: string;
  expiresAt: Date;
}

export const MOCK_USERS: Record<string, MockUser> = {
  alice: {
    userId: 'user-alice-001',
    userName: 'Alice',
    avatarUrl: 'https://example.com/alice.png',
    sessionToken: 'valid-token-alice',
    expiresAt: new Date(Date.now() + 86400_000),
  },
  bob: {
    userId: 'user-bob-002',
    userName: 'Bob',
    avatarUrl: 'https://example.com/bob.png',
    sessionToken: 'valid-token-bob',
    expiresAt: new Date(Date.now() + 86400_000),
  },
  charlie: {
    userId: 'user-charlie-003',
    userName: 'Charlie',
    avatarUrl: null,
    sessionToken: 'valid-token-charlie',
    expiresAt: new Date(Date.now() + 86400_000),
  },
  diana: {
    userId: 'user-diana-004',
    userName: 'Diana',
    avatarUrl: 'https://example.com/diana.png',
    sessionToken: 'valid-token-diana',
    expiresAt: new Date(Date.now() + 86400_000),
  },
  eve: {
    userId: 'user-eve-005',
    userName: 'Eve',
    avatarUrl: null,
    sessionToken: 'valid-token-eve',
    expiresAt: new Date(Date.now() + 86400_000),
  },
};

// ─── Enhanced Mock Socket Factory ────────────────────────────────

export interface MockSocketData {
  socket: MockSocket;
  emitted: Array<{ event: string; data: unknown }>;
  joinedRooms: Set<string>;
}

export interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  handshake: { auth: { token: string } };
  emit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock Socket.io socket with room tracking and emit capture.
 */
export function createMockSocket(user: MockUser = MOCK_USERS.alice): MockSocketData {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const joinedRooms = new Set<string>();

  const socket: MockSocket = {
    id: `socket-${user.userId}-${Math.random().toString(36).slice(2, 8)}`,
    data: {
      userId: user.userId,
      userName: user.userName,
      avatarUrl: user.avatarUrl,
      sessionToken: user.sessionToken,
    },
    handshake: {
      auth: { token: user.sessionToken },
    },
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event, data });
    }),
    join: vi.fn((room: string) => {
      joinedRooms.add(room);
    }),
    leave: vi.fn((room: string) => {
      joinedRooms.delete(room);
    }),
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
  };

  return { socket, emitted, joinedRooms };
}

// ─── Enhanced Mock Server Factory ────────────────────────────────

export interface MockServerData {
  server: MockServer;
  emitted: Array<{ room: string; event: string; data: unknown }>;
  /** Map of socketId → MockSocket for socket lookup */
  registeredSockets: Map<string, MockSocket>;
}

export interface MockServer {
  use: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sockets: {
    sockets: Map<string, MockSocket>;
  };
}

/**
 * Creates a mock Socket.io Server with room-based emit tracking
 * and socket registry for disconnect simulation.
 */
export function createMockServer(): MockServerData {
  const emitted: Array<{ room: string; event: string; data: unknown }> = [];
  const registeredSockets = new Map<string, MockSocket>();

  const mockTo = vi.fn((room: string) => ({
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ room, event, data });
    }),
  }));

  const server: MockServer = {
    use: vi.fn(),
    on: vi.fn(),
    to: mockTo,
    close: vi.fn((cb?: () => void) => cb?.()),
    sockets: {
      sockets: registeredSockets,
    },
  };

  return { server, emitted, registeredSockets };
}

/**
 * Register a mock socket with the mock server so it can be found by socketId.
 */
export function registerSocket(serverData: MockServerData, socketData: MockSocketData): void {
  serverData.registeredSockets.set(socketData.socket.id, socketData.socket);
}

// ─── Helper to find emitted events ──────────────────────────────

/**
 * Find all emitted events matching an event name from a socket's emitted array.
 */
export function findEmitted(
  emitted: Array<{ event: string; data: unknown }>,
  eventName: string,
): Array<{ event: string; data: unknown }> {
  return emitted.filter((e) => e.event === eventName);
}

/**
 * Find the most recent emitted event matching an event name.
 */
export function findLastEmitted(
  emitted: Array<{ event: string; data: unknown }>,
  eventName: string,
): { event: string; data: unknown } | undefined {
  const matches = findEmitted(emitted, eventName);
  return matches[matches.length - 1];
}

/**
 * Find server-side emitted events to a specific room.
 */
export function findServerEmitted(
  emitted: Array<{ room: string; event: string; data: unknown }>,
  eventName: string,
  room?: string,
): Array<{ room: string; event: string; data: unknown }> {
  return emitted.filter((e) => e.event === eventName && (!room || e.room === room));
}

// ─── Default Lobby Settings ─────────────────────────────────────

export const DEFAULT_SETTINGS: LobbySettings = {
  isPublic: false,
  maxPlayers: 8,
  maxSpectators: 20,
  allowMidGameJoin: true,
  allowSpectatorPromotion: true,
  autoStartThreshold: null,
  gameDurationOverride: null,
};

// ─── Helper to create a player object ────────────────────────────

export function createPlayer(
  user: MockUser,
  overrides: Partial<RMHboxPlayer> = {},
): RMHboxPlayer {
  return {
    userId: user.userId,
    userName: user.userName,
    avatarUrl: user.avatarUrl,
    socketId: `socket-${user.userId}`,
    isConnected: true,
    isReady: false,
    score: 0,
    roundScore: 0,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
    role: 'player',
    ...overrides,
  };
}

/**
 * Create a spectator object from user data
 */
export function createSpectator(
  user: MockUser,
  overrides: Partial<RMHboxSpectator> = {},
): RMHboxSpectator {
  return {
    userId: user.userId,
    userName: user.userName,
    avatarUrl: user.avatarUrl,
    socketId: `socket-${user.userId}`,
    isConnected: true,
    joinedAt: Date.now(),
    role: 'spectator',
    ...overrides,
  };
}

/**
 * Create a test lobby with default values
 */
export function createTestLobby(overrides: Partial<RMHboxLobby> = {}): RMHboxLobby {
  return {
    id: 'TEST01',
    hostUserId: MOCK_USERS.alice.userId,
    settings: { ...DEFAULT_SETTINGS },
    players: new Map(),
    spectators: new Map(),
    state: 'WAITING',
    chat: [],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    currentGame: null,
    selectedGame: null,
    matchHistory: [],
    roundNumber: 0,
    pendingGameSettings: null,
    resolvedGameSettings: null,
    ...overrides,
  };
}
