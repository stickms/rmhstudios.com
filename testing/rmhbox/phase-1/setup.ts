/**
 * RMHbox Phase 1 — Test Setup
 *
 * Provides mock factories for Prisma database, Socket.io server/clients,
 * and user sessions. Designed to be environment-agnostic (no real DB or
 * network required).
 */

import { vi } from 'vitest';

// ─── Mock User Data ──────────────────────────────────────────────

export const MOCK_USERS = {
  alice: {
    userId: 'user-alice-001',
    userName: 'Alice',
    avatarUrl: 'https://example.com/alice.png',
    sessionToken: 'valid-token-alice',
    expiresAt: new Date(Date.now() + 86400_000), // 24h from now
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
  expired: {
    userId: 'user-expired-004',
    userName: 'Expired',
    avatarUrl: null,
    sessionToken: 'expired-token',
    expiresAt: new Date(Date.now() - 86400_000), // expired 24h ago
  },
};

// ─── Mock Socket Factory ─────────────────────────────────────────

/**
 * Creates a mock Socket.io socket for testing event handlers.
 */
export function createMockSocket(user = MOCK_USERS.alice) {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const joinedRooms = new Set<string>();

  return {
    socket: {
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
    },
    emitted,
    joinedRooms,
  };
}

// ─── Mock Socket.io Server Factory ───────────────────────────────

/**
 * Creates a mock Socket.io Server for testing service classes.
 */
export function createMockServer() {
  const emitted: Array<{ room: string; event: string; data: unknown }> = [];

  const mockTo = vi.fn((room: string) => ({
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ room, event, data });
    }),
  }));

  return {
    server: {
      use: vi.fn(),
      on: vi.fn(),
      to: mockTo,
      close: vi.fn((cb?: () => void) => cb?.()),
    },
    emitted,
  };
}

// ─── Mock Database (Prisma replacement) ──────────────────────────

/**
 * Creates a mock database pool that simulates session lookups.
 * Uses the MOCK_USERS data to respond to queries.
 */
export function createMockPool() {
  const validTokens = new Map(
    Object.values(MOCK_USERS).map((u) => [
      u.sessionToken,
      {
        userId: u.userId,
        expiresAt: u.expiresAt,
        name: u.userName,
        image: u.avatarUrl,
      },
    ]),
  );

  return {
    query: vi.fn(async (_sql: string, params: unknown[]) => {
      const token = (params as string[])[0];
      const row = validTokens.get(token);
      return { rows: row ? [row] : [] };
    }),
    end: vi.fn(),
  };
}
