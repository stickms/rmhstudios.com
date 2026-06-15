/**
 * RMHbox Phase 4 — Test Setup
 *
 * Provides mock factories for database operations, REST API handlers,
 * Zustand store, and socket client testing.
 *
 * Environment-agnostic: no real DB, network, or browser required.
 */

import { vi } from 'vitest';
import type { RMHboxPlayer } from '../../../server/rmhbox/types';
import type { LobbySettings, ClientLobbyState, ChatMessage, ClientPlayerInfo } from '../../../lib/rmhbox/types';
import type { MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';

// ─── Mock User Data ──────────────────────────────────────────────

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
};

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

// ─── Factory: RMHboxPlayer ──────────────────────────────────────

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
    isAway: false,
    score: 0,
    roundScore: 0,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
    role: 'player',
    ...overrides,
  };
}

// ─── Factory: MinigameResults ───────────────────────────────────

export function createMockResults(
  players: RMHboxPlayer[],
  duration = 5000,
): MinigameResults {
  return {
    rankings: players.map((p, idx) => ({
      userId: p.userId,
      userName: p.userName,
      score: (players.length - idx) * 100,
      rank: idx + 1,
      deltas: { accuracy: 85 + idx, speed: 90 - idx },
    })),
    awards: players.length > 0
      ? [{ userId: players[0].userId, title: 'MVP', description: 'Top scorer', icon: '🏆' }]
      : [],
    gameSpecificData: {},
    duration,
  };
}

// ─── Factory: ClientPlayerInfo ──────────────────────────────────

export function createClientPlayer(
  user: MockUser,
  overrides: Partial<ClientPlayerInfo> = {},
): ClientPlayerInfo {
  return {
    userId: user.userId,
    userName: user.userName,
    avatarUrl: user.avatarUrl,
    isConnected: true,
    isReady: false,
    isAway: false,
    score: 0,
    roundScore: 0,
    isHost: false,
    ...overrides,
  };
}

// ─── Factory: ClientLobbyState ──────────────────────────────────

export function createClientLobbyState(
  overrides: Partial<ClientLobbyState> = {},
): ClientLobbyState {
  return {
    lobbyId: 'TEST01',
    hostUserId: MOCK_USERS.alice.userId,
    state: 'WAITING',
    settings: { ...DEFAULT_SETTINGS },
    players: [createClientPlayer(MOCK_USERS.alice, { isHost: true })],
    spectators: [],
    currentGame: null,
    selectedGame: null,
    roundNumber: 0,
    chat: [],
    myRole: 'player',
    myUserId: MOCK_USERS.alice.userId,
    seq: 0,
    matchHistory: [],
    ...overrides,
  };
}

// ─── Mock Prisma Client ─────────────────────────────────────────

export interface MockPrismaClient {
  rMHboxProfile: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  rMHboxMatch: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  rMHboxMatchPlayer: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
}

export function createMockPrisma(): MockPrismaClient {
  return {
    rMHboxProfile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'profile-1', userId: '' }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    rMHboxMatch: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'match-1' }),
      count: vi.fn().mockResolvedValue(0),
    },
    rMHboxMatchPlayer: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
}

// ─── Mock Socket ────────────────────────────────────────────────

export interface MockSocketData {
  socket: MockSocket;
  emitted: Array<{ event: string; data: unknown }>;
}

export interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
}

export function createMockSocket(user: MockUser = MOCK_USERS.alice): MockSocketData {
  const emitted: Array<{ event: string; data: unknown }> = [];

  const socket: MockSocket = {
    id: `socket-${user.userId}-${Math.random().toString(36).slice(2, 8)}`,
    data: {
      userId: user.userId,
      userName: user.userName,
      avatarUrl: user.avatarUrl,
    },
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event, data });
    }),
    on: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  };

  return { socket, emitted };
}

// ─── Mock Chat Message ──────────────────────────────────────────

export function createChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    userId: MOCK_USERS.alice.userId,
    userName: MOCK_USERS.alice.userName,
    content: 'Hello!',
    timestamp: Date.now(),
    type: 'user',
    ...overrides,
  };
}
