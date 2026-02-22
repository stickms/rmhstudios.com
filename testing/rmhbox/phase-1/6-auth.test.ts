/**
 * Phase 1 — Section 6: Authentication Middleware
 *
 * Tests the auth middleware with mocked database lookups.
 * Verifies that valid tokens pass, invalid/missing/expired tokens fail,
 * and user data is attached to socket.data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MOCK_USERS, createMockSocket } from './setup';

// Mock the pg module before importing auth
const mockQuery = vi.fn();

vi.mock('pg', () => {
  return {
    Pool: class MockPool {
      query = mockQuery;
      end = vi.fn();
    },
  };
});

import { authMiddleware } from '../../../server/rmhbox/auth';

function setupMockDB() {
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

  mockQuery.mockImplementation(async (_sql: string, params: unknown[]) => {
    const token = (params as string[])[0];
    const row = validTokens.get(token);
    return { rows: row ? [row] : [] };
  });
}

describe('Auth Middleware (§6.1)', () => {
  beforeEach(() => {
    setupMockDB();
  });

  it('should reject connection with missing token', async () => {
    const { socket } = createMockSocket(MOCK_USERS.alice);
    socket.handshake.auth = {};

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('AUTH_REQUIRED');
  });

  it('should reject connection with non-string token', async () => {
    const { socket } = createMockSocket(MOCK_USERS.alice);
    socket.handshake.auth = { token: 12345 };

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('AUTH_REQUIRED');
  });

  it('should reject connection with invalid token', async () => {
    const { socket } = createMockSocket(MOCK_USERS.alice);
    socket.handshake.auth = { token: 'invalid-token-xyz' };

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('AUTH_FAILED');
  });

  it('should reject connection with expired session', async () => {
    const { socket } = createMockSocket(MOCK_USERS.expired);
    socket.handshake.auth = { token: MOCK_USERS.expired.sessionToken };

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('SESSION_EXPIRED');
  });

  it('should accept valid token and attach user data', async () => {
    const { socket } = createMockSocket(MOCK_USERS.alice);
    socket.handshake.auth = { token: MOCK_USERS.alice.sessionToken };

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called with no arguments = success
    expect(socket.data.userId).toBe(MOCK_USERS.alice.userId);
    expect(socket.data.userName).toBe(MOCK_USERS.alice.userName);
    expect(socket.data.avatarUrl).toBe(MOCK_USERS.alice.avatarUrl);
    expect(socket.data.sessionToken).toBe(MOCK_USERS.alice.sessionToken);
  });

  it('should accept valid token for different users', async () => {
    const { socket } = createMockSocket(MOCK_USERS.bob);
    socket.handshake.auth = { token: MOCK_USERS.bob.sessionToken };

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe(MOCK_USERS.bob.userId);
  });

  it('should reject connection with null auth object', async () => {
    const { socket } = createMockSocket(MOCK_USERS.alice);
    socket.handshake.auth = null as any;

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('AUTH_REQUIRED');
  });

  it('should handle database errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

    const { socket } = createMockSocket(MOCK_USERS.alice);
    socket.handshake.auth = { token: MOCK_USERS.alice.sessionToken };

    const next = vi.fn();
    await authMiddleware(socket as any, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('AUTH_FAILED');
  });
});
