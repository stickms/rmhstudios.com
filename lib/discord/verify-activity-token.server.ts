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

import { lruL1 } from '@/lib/cached.server';

const DISCORD_API = 'https://discord.com/api/v10';
const VERIFY_TIMEOUT_MS = 5000;
/** A verified token is trusted for at most this long (and never past its own expiry). */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 1000;

export interface DiscordActivityIdentity {
  discordId: string;
  /** Epoch ms at which the Discord token itself stops being valid. */
  expiresAt: number;
}

// In-process on purpose: the entry is a bearer-token verdict (never shared via Redis), bounded by
// the token's own expiry, and a miss only costs one more call to Discord.
const cache = lruL1('discord-activity-token', { maxEntries: CACHE_MAX });

/** The Discord identity behind a valid Activity token for our application, else null. */
export async function verifyDiscordActivityToken(
  token: string,
): Promise<DiscordActivityIdentity | null> {
  const appId = process.env.DISCORD_ACTIVITY_CLIENT_ID;
  if (!appId || !token) return null;

  const hit = cache.get<DiscordActivityIdentity>(token);
  if (hit) return hit;

  try {
    const res = await fetch(`${DISCORD_API}/oauth2/@me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const info = (await res.json()) as {
      application?: { id?: string };
      expires?: string;
      user?: { id?: string };
    };
    if (info?.application?.id !== appId) return null;
    const expiresAt = Date.parse(info?.expires ?? '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const id = info?.user?.id;
    if (!id || typeof id !== 'string') return null;

    const identity = { discordId: id, expiresAt };
    cache.set(token, identity, Math.min(expiresAt - Date.now(), CACHE_TTL_MS));
    return identity;
  } catch {
    return null;
  }
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(headers: Headers): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(headers.get('authorization') ?? '');
  return m?.[1] ?? null;
}

/** Test seam: forget every verified token. */
export function clearActivityTokenCache(): void {
  cache.clear();
}
