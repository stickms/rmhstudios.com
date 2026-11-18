/**
 * Verify a Discord Activity access token (`Authorization: Bearer …`) for an HTTP route.
 *
 * Same rules as the socket hub's `verifyDiscordActivityToken`
 * (server/socket-server/index.ts), which keeps its own copy because it also resolves the
 * seat's display identity from the hub's pg pool: `/oauth2/@me` (not `/users/@me`) so the
 * response names the application the token was issued for, which must be ours; the token's
 * own expiry must be in the future; and with no `DISCORD_ACTIVITY_CLIENT_ID` configured
 * there is nothing to bind the token to, so it fails closed.
 */

import { createHash } from 'node:crypto';
import { lruL1 } from '@/lib/cached.server';
import { rateLimit } from '@/lib/rate-limit';
import { createSingleFlight } from '@/lib/single-flight';

const DISCORD_API =
  'https://discord.com/api/v10';
const VERIFY_TIMEOUT_MS = 5000;
/** A verified token is trusted for at most this long (and never past its own expiry). */
const CACHE_TTL_MS =
  5 *
  60 *
  1000;
const CACHE_MAX = 1000;
/** A token Discord refused is not asked about again for this long. */
const DENIED_TTL_MS =
  60 *
  1000;
/** Unseen-token verifications (each one is an outbound Discord call) allowed per IP per minute. */
const VERIFY_PER_IP = 30;
const VERIFY_WINDOW_MS =
  60 *
  1000;

export interface DiscordActivityIdentity {
  discordId: string;
  /** Epoch ms at which the Discord token itself stops being valid. */
  expiresAt: number;
}

// In-process on purpose: the entry is a bearer-token verdict (never shared via Redis), bounded by
// the token's own expiry, and a miss only costs one more call to Discord. Keys are the sha256 of
// the token, so no raw bearer token (good or bad) is ever held as a key.
const cache =
  lruL1(
    'discord-activity-token',
    {
      maxEntries:
        CACHE_MAX,
    },
  );
// In-process on purpose: a short-lived "Discord said no" memo per hashed token, so spraying random
// tokens costs us one call each at most, and it must never outlive the process or travel to Redis.
const denied =
  lruL1(
    'discord-activity-token-denied',
    {
      maxEntries:
        CACHE_MAX,
    },
  );
// In-process on purpose: throttles the log line for an over-limit IP to once a minute.
const limitLogged =
  lruL1(
    'discord-activity-verify-limit-log',
    {
      maxEntries:
        CACHE_MAX,
    },
  );
const flight =
  createSingleFlight<Verdict>();

type Verdict =
  | {
      kind: 'ok';
      identity: DiscordActivityIdentity;
    }
  /** Discord refused it (401, wrong application, expired): safe to remember. */
  | {
      kind: 'denied';
    }
  /** Network error, timeout, 5xx or 429: says nothing about the token, so never remembered. */
  | {
      kind: 'transient';
    };

const tokenKey =
  (
    token: string,
  ) =>
    createHash(
      'sha256',
    )
      .update(
        token,
      )
      .digest(
        'hex',
      );

async function lookup(
  token: string,
  appId: string,
): Promise<Verdict> {
  try {
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
              VERIFY_TIMEOUT_MS,
            ),
        },
      );
    if (
      res.status ===
        429 ||
      res.status >=
        500
    )
      return {
        kind: 'transient',
      };
    if (
      !res.ok
    )
      return {
        kind: 'denied',
      };
    const info =
      (await res.json()) as {
        application?: {
          id?: string;
        };
        expires?: string;
        user?: {
          id?: string;
        };
      };
    if (
      info
        ?.application
        ?.id !==
      appId
    )
      return {
        kind: 'denied',
      };
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
      return {
        kind: 'denied',
      };
    const id =
      info
        ?.user
        ?.id;
    if (
      !id ||
      typeof id !==
        'string'
    )
      return {
        kind: 'denied',
      };
    return {
      kind: 'ok',
      identity:
        {
          discordId:
            id,
          expiresAt,
        },
    };
  } catch {
    return {
      kind: 'transient',
    };
  }
}

/**
 * The Discord identity behind a valid Activity token for our application, else null.
 *
 * `ip` is the caller's address: a cache hit (good or bad) costs nothing, but every token we have
 * not seen costs an outbound Discord call, so those are limited per IP before the call is made.
 * Over the limit the caller is simply anonymous.
 */
export async function verifyDiscordActivityToken(
  token: string,
  ip = 'unknown',
): Promise<DiscordActivityIdentity | null> {
  const appId =
    process
      .env
      .DISCORD_ACTIVITY_CLIENT_ID;
  if (
    !appId ||
    !token
  )
    return null;

  const key =
    tokenKey(
      token,
    );
  const hit =
    cache.get<DiscordActivityIdentity>(
      key,
    );
  if (
    hit
  )
    return hit;
  if (
    denied.get<true>(
      key,
    )
  )
    return null;

  const limit =
    rateLimit(
      ip,
      {
        limit:
          VERIFY_PER_IP,
        windowMs:
          VERIFY_WINDOW_MS,
        prefix:
          'discord-activity-verify',
        applyMultiplier: false,
      },
    );
  if (
    !limit.allowed
  ) {
    if (
      !limitLogged.get<true>(
        ip,
      )
    ) {
      limitLogged.set(
        ip,
        true,
        VERIFY_WINDOW_MS,
      );
      console.warn(
        `[discord-activity] token verification rate limit hit for ${ip}`,
      );
    }
    return null;
  }

  const verdict =
    await flight(
      key,
      () =>
        lookup(
          token,
          appId,
        ),
    );
  if (
    verdict.kind ===
    'ok'
  ) {
    cache.set(
      key,
      verdict.identity,
      Math.min(
        verdict
          .identity
          .expiresAt -
          Date.now(),
        CACHE_TTL_MS,
      ),
    );
    return verdict.identity;
  }
  if (
    verdict.kind ===
    'denied'
  )
    denied.set(
      key,
      true,
      DENIED_TTL_MS,
    );
  return null;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(
  headers: Headers,
):
  | string
  | null {
  const m =
    /^Bearer\s+(\S+)$/i.exec(
      headers.get(
        'authorization',
      ) ??
        '',
    );
  return (
    m?.[1] ??
    null
  );
}

/** Test seam: forget every verified token. */
export function clearActivityTokenCache(): void {
  cache.clear();
  denied.clear();
}
