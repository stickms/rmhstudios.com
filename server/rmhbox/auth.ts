import { Pool } from 'pg';
import { config } from './config';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io';

// ─── Database connection pool ────────────────────────────────────

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

// ─── Identity resolution ─────────────────────────────────────────

interface ValidatedIdentity {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

async function validateSessionToken(token: string): Promise<ValidatedIdentity | null> {
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
  if (new Date(row.expiresAt) < new Date()) return null;

  return {
    userId: row.userId,
    userName: row.name || 'Player',
    avatarUrl: row.image || null,
  };
}

/**
 * Validates a Discord OAuth2 access token by calling Discord's API,
 * then resolves to a linked site account if one exists, otherwise
 * falls back to a transient Discord identity (userId = "discord:<id>").
 */
async function validateDiscordToken(discordToken: string): Promise<ValidatedIdentity | null> {
  const userRes = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${discordToken}` },
  });

  if (!userRes.ok) return null;

  const discordUser = await userRes.json();
  const discordId: string = discordUser.id;
  const discordName: string = discordUser.global_name || discordUser.username;
  const discordAvatar: string | null = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
    : null;

  // Check if this Discord account is linked to a site user
  const db = getPool();
  const result = await db.query(
    `SELECT a."userId", u."name", u."image"
     FROM "account" a
     JOIN "user" u ON u."id" = a."userId"
     WHERE a."providerId" = 'discord' AND a."accountId" = $1
     LIMIT 1`,
    [discordId],
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      userId: row.userId,
      userName: row.name || discordName,
      avatarUrl: row.image || discordAvatar,
    };
  }

  // No linked account — use Discord identity directly
  return {
    userId: `discord:${discordId}`,
    userName: discordName,
    avatarUrl: discordAvatar,
  };
}

// ─── Socket.io middleware ────────────────────────────────────────

export async function authMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const { token, discordToken } = socket.handshake.auth ?? {};

  try {
    // Discord Activity path: validate the OAuth2 access token from the Discord SDK
    if (discordToken && typeof discordToken === 'string') {
      const identity = await validateDiscordToken(discordToken);
      if (!identity) return next(new Error('AUTH_FAILED'));

      socket.data.userId = identity.userId;
      socket.data.userName = identity.userName;
      socket.data.avatarUrl = identity.avatarUrl;
      return next();
    }

    // Better Auth session token path (site-login users)
    if (!token || typeof token !== 'string') {
      return next(new Error('AUTH_REQUIRED'));
    }

    const identity = await validateSessionToken(token);
    if (!identity) return next(new Error('AUTH_FAILED'));

    socket.data.userId = identity.userId;
    socket.data.userName = identity.userName;
    socket.data.avatarUrl = identity.avatarUrl;
    socket.data.sessionToken = token;
    next();
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      event: 'auth_validation_error',
      error: String(err),
    }));
    next(new Error('AUTH_FAILED'));
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
