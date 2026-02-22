/**
 * RMHbox Phase 3 — Test Setup
 *
 * Extends Phase 2 setup with game lifecycle-specific helpers.
 * Provides mock factories for VoteManager, GameCoordinator,
 * StateSyncService, ReconnectionHandler, and a TestGame stub
 * minigame for integration testing.
 *
 * Environment-agnostic: no real DB or network connections required.
 */

import { vi } from 'vitest';
import type { RMHboxPlayer, RMHboxSpectator, RMHboxLobby } from '../../../server/rmhbox/types';
import type { LobbySettings } from '../../../lib/rmhbox/types';
import type { MinigameContext, MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';
import { BaseMinigame } from '../../../server/rmhbox/minigames/base-minigame';

// ─── Mock User Data ──────────────────────────────────────────────

export const MOCK_USERS = {
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
  disconnect: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock Socket.io socket with room tracking and emit capture.
 */
export function createMockSocket(user = MOCK_USERS.alice): MockSocketData {
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
    disconnect: vi.fn(),
  };

  return { socket, emitted, joinedRooms };
}

// ─── Enhanced Mock Server Factory ────────────────────────────────

export interface MockServerData {
  server: MockServer;
  emitted: Array<{ room: string; event: string; data: unknown }>;
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

// ─── Event Helpers ───────────────────────────────────────────────

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

/**
 * Find the most recent server-side emitted event.
 */
export function findLastServerEmitted(
  emitted: Array<{ room: string; event: string; data: unknown }>,
  eventName: string,
  room?: string,
): { room: string; event: string; data: unknown } | undefined {
  const matches = findServerEmitted(emitted, eventName, room);
  return matches[matches.length - 1];
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

// ─── Factory Functions ──────────────────────────────────────────

export function createPlayer(
  user: typeof MOCK_USERS.alice,
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

export function createSpectator(
  user: typeof MOCK_USERS.alice,
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
    matchHistory: [],
    roundNumber: 0,
    ...overrides,
  };
}

// ─── Event Handler Invocation Helpers ────────────────────────────

/**
 * Invokes a registered Socket.io event handler on a mock socket.
 * The `validated` wrapper is called as the handler, which then
 * calls the inner handler with (socket, payload).
 */
export function callEvent(socketData: MockSocketData, eventName: string, payload: unknown): void {
  const call = socketData.socket.on.mock.calls.find(
    (c: unknown[]) => c[0] === eventName,
  );
  if (!call) throw new Error(`No handler registered for ${eventName}`);
  // The validated wrapper expects (socket, rawPayload)
  call[1](socketData.socket, payload);
}

// ─── Test Minigame (Stub for Integration Testing) ────────────────

/**
 * A stub minigame for testing the game lifecycle.
 * Auto-completes after a configurable duration (default 100ms for fast tests).
 */
export class TestGame extends BaseMinigame {
  private autoCompleteDuration: number;
  public inputLog: Array<{ userId: string; action: string; data: unknown }> = [];
  public started = false;
  public cleanedUp = false;

  constructor(context: MinigameContext, autoCompleteDuration = 100) {
    super(context);
    this.autoCompleteDuration = autoCompleteDuration;
  }

  start(): void {
    this.isRunning = true;
    this.started = true;
    this.setTimeout(() => {
      if (this.isRunning) {
        this.context.onComplete(this.computeResults());
      }
    }, this.autoCompleteDuration);
  }

  handleInput(userId: string, action: string, data: unknown): void {
    this.inputLog.push({ userId, action, data });
  }

  getStateForPlayer(userId: string): unknown {
    return { test: true, userId, isRunning: this.isRunning };
  }

  getStateForSpectator(): unknown {
    return { test: true, spectator: true, isRunning: this.isRunning };
  }

  computeResults(): MinigameResults {
    const players = Array.from(this.context.players.values());
    return {
      rankings: players.map((p, idx) => ({
        userId: p.userId,
        userName: p.userName,
        score: (players.length - idx) * 100,
        rank: idx + 1,
        deltas: {},
      })),
      awards: [{ userId: players[0]?.userId ?? '', title: 'MVP', description: 'Most Valuable Player', icon: '🏆' }],
      gameSpecificData: {},
      duration: this.autoCompleteDuration,
    };
  }

  cleanup(): void {
    super.cleanup();
    this.cleanedUp = true;
  }
}

/**
 * Creates a TestGame class factory bound to a specific auto-complete duration.
 * Used with MINIGAME_SERVER_REGISTRY.
 */
export function createTestGameClass(autoCompleteDuration = 100) {
  return class BoundTestGame extends TestGame {
    constructor(context: MinigameContext) {
      super(context, autoCompleteDuration);
    }
  };
}
