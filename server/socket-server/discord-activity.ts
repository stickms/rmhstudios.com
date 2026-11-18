/**
 * Discord Activity identity for the games hub: verify an Activity access token against Discord,
 * resolve it to a linked site account or a guest, and keep the verified Discord user id on
 * `socket.data.discordId` (see the vibe room's instance check).
 *
 * Split out of `index.ts` (which boots a server on import) so the abuse protections are testable:
 * a failed verification is remembered for 60 s (keyed by sha256 of the token), concurrent
 * verifications of one token share one outbound call, unseen tokens are limited per handshake IP
 * before any call is made, and transient failures (network, 5xx, 429) are never remembered.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import { createHash } from 'node:crypto';
import { createAuthCache } from '../shared/session-auth';
import { createRateLimiter } from '../shared/rate-limit';
import { createSingleFlight } from '../../lib/single-flight';

/** The linked-account lookup's row. */
export interface LinkedAccountRow {
  userId: string;
  name:
    | string
    | null;
  image:
    | string
    | null;
}

/** What the hub provides: the application id, the auth pool for the linked-account lookup, a logger. */
export interface DiscordActivityDeps {
  appId: string;
  getPool: () => {
    query(
      sql: string,
      params: unknown[],
    ): Promise<{
      rows: LinkedAccountRow[];
    }>;
  } | null;
  logger: {
    warn(
      entry: Record<
        string,
        unknown
      >,
    ): void;
  };
}

// Discord Activity identity cache (positive results only, same TTL/bound as sessions).
interface CachedAuth {
  /** The Discord user id Discord itself returned for the token (never client-supplied). */
  discordId: string;
  userId: string;
  userName: string;
  avatarUrl:
    | string
    | null;
}
const discordAuthCache =
  createAuthCache<CachedAuth>();
// Tokens Discord refused, remembered for the cache TTL (60 s) so spraying random tokens costs one
// outbound call each at most. Keys are sha256(token): no raw bearer token is ever a key.
const discordDeniedCache =
  createAuthCache<true>();
// Throttles the over-limit log line to once per IP per cache TTL.
const discordLimitLogged =
  createAuthCache<true>();
// Unseen-token verifications (one outbound Discord call each) per handshake IP.
const discordVerifyLimiter =
  createRateLimiter(
    {
      'discord:verify':
        {
          max: 30,
          windowMs: 60_000,
        },
    },
  );
const discordVerifyFlight =
  createSingleFlight<DiscordIdentity | null>();

const discordTokenKey =
  (
    token: string,
  ) =>
    `d:${createHash('sha256').update(token).digest('hex')}`;

/**
 * The client address of a handshake: Cloudflare's header when present, else the entry the proxy
 * appended to X-Forwarded-For (the rightmost, never the client-controlled leftmost), else the
 * socket peer.
 */
function handshakeIp(
  socket: import('socket.io').Socket,
): string {
  const h =
    socket
      .handshake
      .headers;
  const one =
    (
      v:
        | string
        | string[]
        | undefined,
    ) =>
      (Array.isArray(
        v,
      )
        ? v[0]
        : v
      )?.trim() ??
      '';
  const cf =
    one(
      h[
        'cf-connecting-ip'
      ],
    );
  if (
    cf
  )
    return cf;
  const xff =
    one(
      h[
        'x-forwarded-for'
      ],
    )
      .split(
        ',',
      )
      .map(
        (
          p,
        ) =>
          p.trim(),
      )
      .filter(
        Boolean,
      );
  return (
    xff[
      xff.length -
        1
    ] ??
    socket
      .handshake
      .address ??
    'unknown'
  );
}

// ─── Discord Activity identity (X10) ─────────────────────────────
//
// An Activity is served from Discord's proxy origin (https://<app-id>
// .discordsays.com), so a cookie scoped to rmhstudios.com is never sent with
// its requests and Better Auth has no session there — for linked accounts as
// much as for anyone else. Without a second identity path, every `slice:*`
// handler answers `auth_required` inside a Discord call.
//
// The token is verified against Discord, server-side, every time. A
// client-supplied Discord user id is never read from anywhere: the id used
// below is the one Discord itself returns for the bearer token.

const DISCORD_API =
  'https://discord.com/api/v10';
const DISCORD_VERIFY_TIMEOUT_MS = 5_000;

/**
 * What a verified Discord Activity token resolves to.
 *
 * `userId` is a real site user id when the Discord account is linked, and
 * `null` for a guest — which is the whole distinction `X10` draws. A guest's
 * name and avatar URL live in this object, in memory, for at most
 * the shared auth-cache TTL (60 s) plus the life of the socket. They are never written
 * to a table, and the avatar is referenced at Discord's CDN rather than copied
 * into our storage.
 */
interface DiscordIdentity {
  /** The Discord user id Discord returned for the token. */
  discordId: string;
  userId:
    | string
    | null;
  name: string;
  avatarUrl:
    | string
    | null;
  /** Absolute epoch-ms at which the Discord token itself stops being valid. */
  expiresAt: number;
}

/** Discord's own default-avatar formula, mirrored from `lib/discord-sdk.ts`. */
function discordAvatarUrl(
  id: string,
  avatar:
    | string
    | null,
  discriminator: string,
): string {
  if (
    avatar
  )
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`;
  const index =
    discriminator ===
      '0' ||
    !discriminator
      ? Number(
          BigInt(
            id,
          ) >>
            22n,
        ) %
        6
      : Number(
          discriminator,
        ) %
        5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/**
 * Verify a Discord Activity access token and resolve who it belongs to.
 *
 * Uses `/oauth2/@me` rather than `/users/@me` (which is what
 * `server/rmhbox/auth.ts` calls) for one reason that matters: its response
 * carries the **application** the token was issued for, so the check below can
 * refuse a perfectly valid Discord token minted for somebody else's app.
 * `/users/@me` cannot tell those apart — any Discord OAuth token in the world
 * passes it — and a hub that seats whoever presents one has no audience
 * binding at all. It also returns the token's own absolute expiry and the user
 * in the same round trip, so this is one outbound call, not two.
 *
 * No client secret is involved: the code→token exchange (the only operation
 * that needs one) stays in `lib/api/routes/discord.token.server.ts` on the web tier.
 * This is the verify half, and verification is Bearer-only.
 */
async function verifyDiscordActivityToken(
  token: string,
  deps: DiscordActivityDeps,
): Promise<DiscordIdentity | null> {
  const appId =
    deps.appId;
  // Fail closed: with no application id there is nothing to bind the token to,
  // and accepting it would mean trusting any Discord app's token.
  if (
    !appId
  )
    return null;

  const res =
    await fetch(
      `${DISCORD_API}/oauth2/@me`,
      {
        headers:
          {
            Authorization: `Bearer ${token}`,
          },
        signal:
          AbortSignal.timeout(
            DISCORD_VERIFY_TIMEOUT_MS,
          ),
      },
    );
  // Transient (rate limited / Discord down): throw so the caller does NOT remember it as a bad token.
  if (
    res.status ===
      429 ||
    res.status >=
      500
  )
    throw new Error(
      `discord_verify_${res.status}`,
    );
  if (
    !res.ok
  )
    return null;

  const info =
    (await res.json()) as {
      application?: {
        id?: string;
      };
      expires?: string;
      user?: {
        id?: string;
        username?: string;
        global_name?:
          | string
          | null;
        avatar?:
          | string
          | null;
        discriminator?: string;
      };
    };

  if (
    info
      ?.application
      ?.id !==
    appId
  )
    return null;

  const expiresAt =
    Date.parse(
      info?.expires ??
        '',
    );
  if (
    !Number.isFinite(
      expiresAt,
    ) ||
    expiresAt <=
      Date.now()
  )
    return null;

  const user =
    info?.user;
  if (
    !user?.id ||
    typeof user.id !==
      'string'
  )
    return null;

  const name =
    user.global_name ||
    user.username ||
    'Guest';
  const avatarUrl =
    discordAvatarUrl(
      user.id,
      user.avatar ??
        null,
      user.discriminator ??
        '0',
    );

  // Linked account → a real site identity, indistinguishable downstream from a
  // session login: their scores count and their seat gets the reconnect grace.
  const pool =
    deps.getPool();
  if (
    pool
  ) {
    const result =
      await pool.query(
        `SELECT a."userId", u."name", u."image"
       FROM "account" a
       JOIN "user" u ON u."id" = a."userId"
       WHERE a."providerId" = 'discord' AND a."accountId" = $1
       LIMIT 1`,
        [
          user.id,
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
        discordId:
          user.id,
        userId:
          row.userId,
        name:
          row.name ||
          name,
        avatarUrl:
          row.image ||
          avatarUrl,
        expiresAt,
      };
    }
  }

  // No linked account → a guest. Deliberately NOT given a synthetic id: an id
  // is the thing every persistence path keys on, and minting one here is how a
  // "we store nothing about guests" rule quietly becomes untrue.
  return {
    discordId:
      user.id,
    userId:
      null,
    name,
    avatarUrl,
    expiresAt,
  };
}

/** Verified Discord identity → `socket.data`. Returns true when it authenticated. */
export async function applyDiscordActivityToken(
  socket: import('socket.io').Socket,
  token: string,
  deps: DiscordActivityDeps,
): Promise<boolean> {
  const key =
    discordTokenKey(
      token,
    );
  const cached =
    discordAuthCache.get(
      key,
    );
  if (
    cached
  ) {
    attachDiscordIdentity(
      socket,
      {
        discordId:
          cached.discordId,
        userId:
          cached.userId ||
          null,
        name: cached.userName,
        avatarUrl:
          cached.avatarUrl,
      },
    );
    return true;
  }
  if (
    discordDeniedCache.get(
      key,
    )
  )
    return false;

  // Per-IP budget BEFORE the outbound call; over it, the socket is simply anonymous.
  const ip =
    handshakeIp(
      socket,
    );
  if (
    !discordVerifyLimiter.check(
      ip,
      'discord:verify',
    )
  ) {
    if (
      !discordLimitLogged.get(
        ip,
      )
    ) {
      discordLimitLogged.set(
        ip,
        true,
        Number.POSITIVE_INFINITY,
      );
      deps.logger.warn(
        {
          event:
            'discord_verify_rate_limited',
          ip,
        },
      );
    }
    return false;
  }

  // Throws on a transient failure (not remembered); null means Discord refused the token.
  const identity =
    await discordVerifyFlight(
      key,
      () =>
        verifyDiscordActivityToken(
          token,
          deps,
        ),
    );
  if (
    !identity
  ) {
    discordDeniedCache.set(
      key,
      true,
      Number.POSITIVE_INFINITY,
    );
    return false;
  }
  attachDiscordIdentity(
    socket,
    identity,
  );

  // A guest carries a null userId; the cache replays it as a guest rather than
  // as an account. The cache never outlives the Discord token's own expiry.
  discordAuthCache.set(
    key,
    {
      discordId:
        identity.discordId,
      userId:
        identity.userId as string,
      userName:
        identity.name,
      avatarUrl:
        identity.avatarUrl,
    },
    identity.expiresAt,
  );
  return true;
}

function attachDiscordIdentity(
  socket: import('socket.io').Socket,
  identity: {
    discordId: string;
    userId:
      | string
      | null;
    name: string;
    avatarUrl:
      | string
      | null;
  },
): void {
  // Verified by Discord, never client-supplied: the vibe room checks it against the Activity instance.
  socket.data.discordId =
    identity.discordId;
  if (
    identity.userId
  ) {
    socket.data.userId =
      identity.userId;
    socket.data.userName =
      identity.name;
    socket.data.avatarUrl =
      identity.avatarUrl;
  } else {
    // The ONLY place a guest identity exists. `socket.data.userId` stays unset,
    // which is what keeps every persistence path (leaderboards, runs, the
    // `User` table) from having anything to write.
    socket.data.discordGuest =
      {
        name: identity.name,
        avatarUrl:
          identity.avatarUrl,
      };
  }
}

/** Test seam: forget every cached verdict, the per-IP budget and in-flight lookups. */
export function resetDiscordActivityForTests(): void {
  discordAuthCache.clear();
  discordDeniedCache.clear();
  discordLimitLogged.clear();
  discordVerifyLimiter.reset();
}
