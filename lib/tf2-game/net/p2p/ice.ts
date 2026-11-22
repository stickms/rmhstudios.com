/**
 * ICE servers for peer-to-peer play — how a host and a member find a path.
 *
 * Configured at build time with `VITE_TF2_ICE_SERVERS`: a JSON array of
 * `RTCIceServer`s, e.g.
 *
 *   VITE_TF2_ICE_SERVERS='[{"urls":["stun:stun.example.org:3478"]},
 *                          {"urls":"turn:turn.example.org:3478","username":"u","credential":"p"}]'
 *
 * Without it the defaults are two public STUN servers (Google's and
 * Cloudflare's). **STUN contacts a third-party server**: it sees the player's
 * public address (that is its whole job) and nothing else — no game data, no
 * account. TURN is optional and never committed here: a TURN credential in a
 * client bundle is an open relay, so it belongs in the deployment's env (and,
 * better, short-lived like `lib/call/ice.ts` mints them). Without TURN, a pair
 * that cannot connect directly falls back to the games hub's relay
 * (`signal.ts` P2P_RELAY_LIMITS).
 *
 * The parser and schema live in lib/shared/p2p/ice.ts (shared with other
 * peer-to-peer apps); this file keeps TF2's defaults and env name.
 *
 * Environment-agnostic (the browser reads the env; tests call the parser).
 */

import {
  DEFAULT_ICE_SERVERS,
  parseIceServers as parseSharedIceServers,
  type IceServerConfig,
} from '../../../shared/p2p/ice';

export type { IceServerConfig };

export const DEFAULT_TF2_ICE_SERVERS: readonly IceServerConfig[] = DEFAULT_ICE_SERVERS;

/**
 * The configured ICE servers: `raw` is the env value. Unset, empty or invalid
 * → the defaults (an invalid value is a deploy mistake; playing with public
 * STUN beats not connecting at all). `[]` is honoured: host candidates only.
 */
export function parseIceServers(raw: unknown): IceServerConfig[] {
  return parseSharedIceServers(raw, DEFAULT_TF2_ICE_SERVERS);
}
