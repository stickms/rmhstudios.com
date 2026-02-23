/**
 * RMHbox Phase 5 — Test Setup
 *
 * Extends Phase 3 setup with minigame-specific helpers for testing
 * the four Phase 5 minigames: Rhyme Time, Undercover Agent,
 * Category Crash, and Wiki-Race.
 *
 * Environment-agnostic: no real DB, Wikipedia API, or network
 * connections required. All external dependencies are mocked.
 */

import { vi } from 'vitest';
import type { RMHboxPlayer } from '../../../server/rmhbox/types';
import type { LobbySettings } from '../../../lib/rmhbox/types';
import type { MinigameContext, MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';

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
  eve: {
    userId: 'user-eve-005',
    userName: 'Eve',
    avatarUrl: null,
    sessionToken: 'valid-token-eve',
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

// ─── Mock Player Factory ─────────────────────────────────────────

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

// ─── MinigameContext Factory ─────────────────────────────────────

export interface MockContextData {
  context: MinigameContext;
  broadcastLog: Array<{ event: string; data: unknown }>;
  playerLog: Array<{ userId: string; event: string; data: unknown }>;
  spectatorLog: Array<{ event: string; data: unknown }>;
  completedResults: MinigameResults[];
  errors: Error[];
}

/**
 * Creates a fully mocked MinigameContext with emit capture.
 * All broadcasts/sends are captured into arrays for assertions.
 */
export function createMockContext(
  playerUsers: MockUser[] = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
  overrides: Partial<MinigameContext> = {},
): MockContextData {
  const broadcastLog: Array<{ event: string; data: unknown }> = [];
  const playerLog: Array<{ userId: string; event: string; data: unknown }> = [];
  const spectatorLog: Array<{ event: string; data: unknown }> = [];
  const completedResults: MinigameResults[] = [];
  const errors: Error[] = [];

  const players = new Map<string, RMHboxPlayer>();
  for (const user of playerUsers) {
    players.set(user.userId, createPlayer(user));
  }

  const context: MinigameContext = {
    lobbyId: 'TEST01',
    players,
    settings: { ...DEFAULT_SETTINGS },
    getHostId: () => playerUsers[0]?.userId ?? 'host-user',
    broadcastToLobby: vi.fn((event: string, data: unknown) => {
      broadcastLog.push({ event, data });
    }),
    broadcastToPlayers: vi.fn((event: string, data: unknown) => {
      broadcastLog.push({ event, data });
    }),
    broadcastAction: vi.fn(),
    sendToPlayer: vi.fn((userId: string, event: string, data: unknown) => {
      playerLog.push({ userId, event, data });
    }),
    sendToSpectators: vi.fn((event: string, data: unknown) => {
      spectatorLog.push({ event, data });
    }),
    onComplete: vi.fn((results: MinigameResults) => {
      completedResults.push(results);
    }),
    onError: vi.fn((error: Error) => {
      errors.push(error);
    }),
    ...overrides,
  };

  return { context, broadcastLog, playerLog, spectatorLog, completedResults, errors };
}

// ─── Broadcast Lookup Helpers ────────────────────────────────────

/**
 * Find all broadcast events matching an event name from a log array.
 */
export function findBroadcasts(
  log: Array<{ event: string; data: unknown }>,
  eventName: string,
): Array<{ event: string; data: unknown }> {
  return log.filter((e) => e.event === eventName);
}

/**
 * Find the most recent broadcast matching an event name.
 */
export function findLastBroadcast(
  log: Array<{ event: string; data: unknown }>,
  eventName: string,
): { event: string; data: unknown } | undefined {
  const matches = findBroadcasts(log, eventName);
  return matches[matches.length - 1];
}

/**
 * Find all player-specific events for a given userId and event name.
 */
export function findPlayerEvents(
  log: Array<{ userId: string; event: string; data: unknown }>,
  userId: string,
  eventName?: string,
): Array<{ userId: string; event: string; data: unknown }> {
  return log.filter(
    (e) => e.userId === userId && (!eventName || e.event === eventName),
  );
}

/**
 * Find the most recent player-specific event.
 */
export function findLastPlayerEvent(
  log: Array<{ userId: string; event: string; data: unknown }>,
  userId: string,
  eventName?: string,
): { userId: string; event: string; data: unknown } | undefined {
  const matches = findPlayerEvents(log, userId, eventName);
  return matches[matches.length - 1];
}

/**
 * Find broadcast events by action type (data.type field).
 */
export function findActionBroadcasts(
  log: Array<{ event: string; data: unknown }>,
  actionType: string,
): Array<{ event: string; data: Record<string, unknown> }> {
  return log.filter((e) => {
    const d = e.data as Record<string, unknown>;
    return d.type === actionType;
  }) as Array<{ event: string; data: Record<string, unknown> }>;
}

/**
 * Find the last broadcast event by action type (data.type field).
 */
export function findLastActionBroadcast(
  log: Array<{ event: string; data: unknown }>,
  actionType: string,
): { event: string; data: Record<string, unknown> } | undefined {
  const matches = findActionBroadcasts(log, actionType);
  return matches[matches.length - 1];
}

/**
 * Find player-specific events by action type (data.type field).
 */
export function findPlayerActions(
  log: Array<{ userId: string; event: string; data: unknown }>,
  userId: string,
  actionType: string,
): Array<{ userId: string; event: string; data: Record<string, unknown> }> {
  return log.filter((e) => {
    const d = e.data as Record<string, unknown>;
    return e.userId === userId && d.type === actionType;
  }) as Array<{ userId: string; event: string; data: Record<string, unknown> }>;
}

/**
 * Find the last player-specific event by action type.
 */
export function findLastPlayerAction(
  log: Array<{ userId: string; event: string; data: unknown }>,
  userId: string,
  actionType: string,
): { userId: string; event: string; data: Record<string, unknown> } | undefined {
  const matches = findPlayerActions(log, userId, actionType);
  return matches[matches.length - 1];
}
