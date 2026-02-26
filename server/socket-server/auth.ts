/**
 * Socket Server — Authentication Middleware
 *
 * Validates Better Auth session tokens against PostgreSQL.
 * Attaches userId, userName, and avatarUrl to socket.data.
 */

import { Pool } from 'pg';
import { config } from './config';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

interface ValidatedSession {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  expiresAt: Date;
}

async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT s."userId", s."expiresAt", u."name", u."image"
     FROM "session" s
     JOIN "user" u ON u."id" = s."userId"
     WHERE s."token" = $1
     LIMIT 1`,
    [token],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    userId: row.userId,
    userName: row.name || 'Player',
    avatarUrl: row.image || null,
    expiresAt: new Date(row.expiresAt),
  };
}

export async function authMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== 'string') {
    return next(new Error('AUTH_REQUIRED'));
  }

  try {
    const session = await validateSessionToken(token);

    if (!session) {
      return next(new Error('AUTH_FAILED'));
    }

    if (session.expiresAt < new Date()) {
      return next(new Error('SESSION_EXPIRED'));
    }

    socket.data.userId = session.userId;
    socket.data.userName = session.userName;
    socket.data.avatarUrl = session.avatarUrl;
    socket.data.sessionToken = token;

    next();
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'socket-server',
      timestamp: new Date().toISOString(),
      event: 'auth_validation_error',
      error: String(err),
    }));
    next(new Error('AUTH_FAILED'));
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
