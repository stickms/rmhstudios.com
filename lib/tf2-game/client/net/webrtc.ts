/**
 * The browser's half of the peer-to-peer transport: an `RTCPeerConnection`
 * per host ↔ member pair carrying the two DataChannels `PeerLink`
 * (net/p2p/link.ts) runs on, and the hub-relay stand-in used when no direct
 * path exists.
 *
 *   - Both channels are `negotiated` with fixed ids (0 `unreliable`:
 *     `ordered: false, maxRetransmits: 0`; 1 `reliable`: ordered), so each side
 *     creates them itself and there is no `ondatachannel` race.
 *   - The host makes the offer; candidates trickle through the hub
 *     (`tf2:p2p:signal`), queued until the remote description is set.
 *   - ICE tries, in order: host and STUN candidates (direct), then TURN — the
 *     hub hands each account short-lived TURN credentials with its room
 *     (lib/call/ice.ts minting; no static credential is ever in the bundle) —
 *     and only then, when no pair connects within `DIRECT_TIMEOUT_MS` (8 s,
 *     `TURN_TIMEOUT_MS` 12 s when a TURN server is configured: an allocation
 *     takes a few round trips), the hub relay (`tf2:p2p:relay:start`); both
 *     sides then swap in `RelayChannel`s and close the peer connection. The
 *     link above never knows the difference. The connection is labelled from
 *     the selected candidate pair: Direct, TURN (a `relay` candidate) or
 *     Relayed (the hub).
 *
 * Test hooks (`globalThis.__tf2P2pTest`, read once per connection; the
 * real-browser smoke sets them with an init script): `iceServers` overrides
 * the configured servers, `blockCandidates` drops every local candidate (so a
 * direct path can never form), `relayOnly` gathers only TURN candidates,
 * `directTimeoutMs` shortens the wait.
 *
 * The transport itself lives in lib/shared/p2p/webrtc.ts (shared with other
 * peer-to-peer apps); this file binds it to TF2's env (`VITE_TF2_ICE_SERVERS`)
 * and test hooks and re-exports the rest unchanged.
 *
 * Browser only.
 */

import { parseIceServers, type IceServerConfig } from '../../net/p2p/ice';
import type { P2pSignalOut } from '../../net/p2p/signal';
import { hasTurn, resolveIceServers } from '../../../shared/p2p/ice';
import {
  DirectConnection as SharedDirectConnection,
  type DirectConnectionOptions as SharedDirectConnectionOptions,
  type P2pTestHooks,
} from '../../../shared/p2p/webrtc';

export {
  DIRECT_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
  DataChannelAdapter,
  RelayChannel,
  relayPair,
  type P2pTestHooks,
  type ChannelPair,
  type RelayPair,
} from '../../../shared/p2p/webrtc';

function testHooks(): P2pTestHooks {
  const hooks = (globalThis as { __tf2P2pTest?: P2pTestHooks }).__tf2P2pTest;
  return hooks && typeof hooks === 'object' ? hooks : {};
}

/**
 * The ICE servers to use: the test override; else the hub's list for this account (STUN, then TURN
 * with a short-lived credential), checked again here; else `VITE_TF2_ICE_SERVERS` (net/p2p/ice.ts)
 * or the default public STUN servers.
 */
export function tf2IceServers(fromHub?: unknown): IceServerConfig[] {
  const hooks = testHooks();
  if (Array.isArray(hooks.iceServers)) return hooks.iceServers;
  return resolveIceServers(fromHub, parseIceServers(import.meta.env.VITE_TF2_ICE_SERVERS));
}

/** Whether a list has a TURN server (the wait before the hub relay is longer then). */
export function hasTurnServer(servers: readonly IceServerConfig[]): boolean {
  return hasTurn(servers);
}

export interface DirectConnectionOptions extends Omit<SharedDirectConnectionOptions, 'iceServers' | 'hooks' | 'signal'> {
  /** This account's ICE servers from the hub (STUN, TURN); undefined: the configured ones. */
  iceServers?: unknown;
  /** Sends one signal to the other side (through the hub). */
  signal: (s: Omit<P2pSignalOut, 'to'>) => void;
}

/** The direct WebRTC path for one host ↔ member pair, with TF2's ICE resolution and test hooks. */
export class DirectConnection extends SharedDirectConnection {
  constructor(opts: DirectConnectionOptions) {
    super({ ...opts, iceServers: tf2IceServers(opts.iceServers), hooks: testHooks() });
  }
}
