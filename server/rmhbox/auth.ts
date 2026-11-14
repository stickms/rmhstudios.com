import { config } from './config';
import { TRANSIENT_DISCORD_ID_PREFIX } from '../../lib/rmhbox/utils';
import {
  createAuthCache,
  createSessionAuth,
} from '../shared/session-auth';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io';

// The Better Auth session check (token -> session JOIN user, expiry, cache) is
// shared by every hub: server/shared/session-auth.ts. The Discord Activity path
// below is a different credential and stays here.
const sessionAuth =
  createSessionAuth(
    {
      service:
        'rmhbox',
      databaseUrl:
        config.DATABASE_URL,
      defaultName:
        'Player',
    },
  );

// ─── Identity resolution ─────────────────────────────────────────

interface ValidatedIdentity {
  userId: string;
  userName: string;
  avatarUrl:
    | string
    | null;
}

/**
 * Validates a Discord OAuth2 access token by calling Discord's API,
 * then resolves to a linked site account if one exists, otherwise
 * falls back to a transient Discord identity (userId = "discord:<id>").
 */
async function validateDiscordToken(
  discordToken: string,
): Promise<ValidatedIdentity | null> {
  const userRes =
    await fetch(
      'https://discord.com/api/v10/users/@me',
      {
        headers:
          {
            Authorization: `Bearer ${discordToken}`,
          },
      },
    );

  if (
    !userRes.ok
  )
    return null;

  const discordUser =
    await userRes.json();
  const discordId: string =
    discordUser.id;
  const discordName: string =
    discordUser.global_name ||
    discordUser.username;
  const discordAvatar:
    | string
    | null =
    discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
      : null;

  // Check if this Discord account is linked to a site user
  const db =
    sessionAuth.getPool();
  if (
    !db
  )
    throw new Error(
      'DATABASE_URL is not configured',
    );
  const result =
    await db.query(
      `SELECT a."userId", u."name", u."image"
     FROM "account" a
     JOIN "user" u ON u."id" = a."userId"
     WHERE a."providerId" = 'discord' AND a."accountId" = $1
     LIMIT 1`,
      [
        discordId,
      ],
    );

  if (
    result
      .rows
      .length >
    0
  ) {
    const row =
      result
        .rows[0];
    return {
      userId:
        row.userId,
      userName:
        row.name ||
        discordName,
      avatarUrl:
        row.image ||
        discordAvatar,
    };
  }

  // No linked account — use the Discord identity directly. This ID has no row
  // in `user`, so anything persisting per-user data must skip it
  // (`isTransientDiscordIdentity` in lib/rmhbox/utils).
  return {
    userId: `${TRANSIENT_DISCORD_ID_PREFIX}${discordId}`,
    userName:
      discordName,
    avatarUrl:
      discordAvatar,
  };
}

// ─── Discord identity cache ──────────────────────────────────────
//
// The Discord path makes an outbound Discord API call plus an `account` lookup
// per socket; cache positive validations for the shared short TTL. Keyed "d:"
// (the session cache lives in sessionAuth). Only successes are cached; the
// entry never expires on its own (POSITIVE_INFINITY) — the TTL alone bounds it.
const discordCache =
  createAuthCache<ValidatedIdentity>();

/**
 * Test-only: clear the in-process auth cache. The cache is a module-level
 * singleton, so unit tests that exercise the DB path must reset it between
 * cases (otherwise a prior test's cached success short-circuits the DB call).
 */
export function __resetAuthCache(): void {
  discordCache.clear();
  sessionAuth.resetCache();
}

// ─── Socket.io middleware ────────────────────────────────────────

export async function authMiddleware(
  socket: Socket,
  next: (
    err?: ExtendedError,
  ) => void,
): Promise<void> {
  const {
    discordToken,
    channelId,
    guildId,
  } =
    socket
      .handshake
      .auth ??
    {};

  try {
    // Discord Activity path: validate the OAuth2 access token from the Discord SDK
    if (
      discordToken &&
      typeof discordToken ===
        'string'
    ) {
      let identity =
        discordCache.get(
          `d:${discordToken}`,
        );
      if (
        !identity
      ) {
        identity =
          await validateDiscordToken(
            discordToken,
          );
        if (
          !identity
        )
          return next(
            new Error(
              'AUTH_FAILED',
            ),
          );
        discordCache.set(
          `d:${discordToken}`,
          identity,
          Number.POSITIVE_INFINITY,
        );
      }

      socket.data.userId =
        identity.userId;
      socket.data.userName =
        identity.userName;
      socket.data.avatarUrl =
        identity.avatarUrl;
      // Voice-channel context for auto-connecting players in the same voice chat.
      socket.data.discordChannelId =
        typeof channelId ===
        'string'
          ? channelId
          : null;
      socket.data.discordGuildId =
        typeof guildId ===
        'string'
          ? guildId
          : null;
      return next();
    }

    // Better Auth session token path (site-login users)
    const result =
      await sessionAuth.resolveSocketSession(
        socket.handshake,
      );
    if (
      result.status ===
      'no_token'
    )
      return next(
        new Error(
          'AUTH_REQUIRED',
        ),
      );
    if (
      result.status ===
      'expired'
    )
      return next(
        new Error(
          'SESSION_EXPIRED',
        ),
      );
    if (
      result.status !==
      'ok'
    )
      return next(
        new Error(
          'AUTH_FAILED',
        ),
      );

    socket.data.userId =
      result.session.userId;
    socket.data.userName =
      result.session.name;
    socket.data.avatarUrl =
      result.session.image;
    socket.data.sessionToken =
      result.session.token;
    next();
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          level:
            'error',
          timestamp:
            new Date().toISOString(),
          event:
            'auth_validation_error',
          error:
            String(
              err,
            ),
        },
      ),
    );
    next(
      new Error(
        'AUTH_FAILED',
      ),
    );
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  await sessionAuth.close();
}
