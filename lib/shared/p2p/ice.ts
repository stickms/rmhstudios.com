/**
 * ICE servers for peer-to-peer play — how a host and a member find a path.
 *
 * The hub mints each account's list (STUN, then TURN with a short-lived
 * coturn REST credential: lib/call/ice.ts) and hands it out with the room;
 * the browser parses it again with `zIceServers` before use (a buggy hub is
 * still just data). Without a hub list, an app falls back to a build-time env
 * value (`parseIceServers`) or the public STUN defaults. **STUN contacts a
 * third-party server**: it sees the player's public address and nothing else.
 * TURN credentials never live in a client bundle.
 *
 * Extracted from the TF2 transport (lib/tf2-game/net/p2p/ice.ts re-exports it).
 * Environment-agnostic; no `@/` specifiers.
 */

import { z } from 'zod';
import { copyIceServers as copy, DEFAULT_ICE_SERVERS, type IceServerConfig } from './ice-core';

// The zod-free pieces live in ./ice-core.ts (the browser transport imports them from there).
export { DEFAULT_ICE_SERVERS, hasTurn, copyIceServers, type IceServerConfig } from './ice-core';

const iceUrl = z.string().regex(/^(stun|stuns|turn|turns):[^\s]{1,250}$/);

/** ICE servers as the hub hands them out (and as a browser accepts them). */
export const zIceServers = z
  .array(
    z.object({
      urls: z.union([iceUrl, z.array(iceUrl).min(1).max(8)]),
      username: z.string().max(256).optional(),
      credential: z.string().max(256).optional(),
    }),
  )
  .max(8);

/**
 * The configured ICE servers: `raw` is an env value (a JSON array of
 * `RTCIceServer`s). Unset, empty or invalid → `fallback` (an invalid value is a
 * deploy mistake; public STUN beats not connecting). `[]` is honoured: host
 * candidates only.
 */
export function parseIceServers(
  raw: unknown,
  fallback: readonly IceServerConfig[] = DEFAULT_ICE_SERVERS,
): IceServerConfig[] {
  if (typeof raw !== 'string' || raw.trim() === '') return copy(fallback);
  try {
    const parsed = zIceServers.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through */
  }
  return copy(fallback);
}

/**
 * The list to use: the hub's (when it parses and is non-empty), else `fallback`.
 * `fromHub` is untrusted data.
 */
export function resolveIceServers(
  fromHub: unknown,
  fallback: readonly IceServerConfig[] = DEFAULT_ICE_SERVERS,
): IceServerConfig[] {
  const hub = fromHub === undefined ? null : zIceServers.safeParse(fromHub);
  if (hub?.success && hub.data.length > 0) return hub.data;
  return copy(fallback);
}

/**
 * Trim a list to what `zIceServers` accepts (≤ 8 servers, ≤ 8 valid urls each,
 * bounded credentials) — for the hub, so an over-long `STUN_URLS` never makes
 * a browser reject the whole list.
 */
export function clampIceServers(list: readonly IceServerConfig[]): IceServerConfig[] {
  const out: IceServerConfig[] = [];
  for (const s of list) {
    if (out.length >= 8) break;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => iceUrl.safeParse(u).success).slice(0, 8);
    if (urls.length === 0) continue;
    if ((s.username?.length ?? 0) > 256 || (s.credential?.length ?? 0) > 256) continue;
    const entry: IceServerConfig = { urls };
    if (s.username !== undefined) entry.username = s.username;
    if (s.credential !== undefined) entry.credential = s.credential;
    out.push(entry);
  }
  return out;
}
