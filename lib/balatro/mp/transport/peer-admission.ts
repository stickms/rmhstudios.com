/**
 * Signalling glue shared by both ends of a host ↔ member connection: turning
 * a DirectConnection's outgoing signal into the hub's `balatro:p2p:signal`
 * payload, and the relay fallback's channel pair.
 *
 * Relay framing (lib/shared/p2p/relay.ts): the hub stamps the member's slot
 * on member → host frames and routes host → member frames by the slot the
 * host writes, which it reads off the member's peer id (`relaySlotOf`, WS1
 * hand-off). Only members start the relay (`balatro:p2p:relay:start`), and
 * the hub forwards nothing for a member before it did; so the host switches
 * a member to the relay when that member's first relayed frame arrives (its
 * own failed direct attempt only stops trying).
 */

import { decodeRelay } from '../../../shared/p2p/relay';
import { relayPair, type RelayPair, type SignalOut } from '../../../shared/p2p/webrtc';
import { BALATRO_LIMITS } from '../../net/limits';
import type { HubLike, HubOut } from './types';

/** A DirectConnection signal → the hub payload, or null when it cannot travel (null candidate, oversize). */
export function signalPayload(s: SignalOut, to?: string): HubOut<'balatro:p2p:signal'> | null {
  if (s.description) {
    if (s.description.sdp.length > BALATRO_LIMITS.SDP_MAX_LENGTH) return null;
    return { ...(to ? { to } : {}), description: { type: s.description.type, sdp: s.description.sdp } };
  }
  const c = s.candidate;
  if (!c || c.candidate.length > BALATRO_LIMITS.CANDIDATE_MAX_LENGTH) return null;
  const mid = c.sdpMid ?? null;
  const line = c.sdpMLineIndex ?? null;
  return {
    ...(to ? { to } : {}),
    candidate: {
      candidate: c.candidate,
      sdpMid: mid === null ? null : String(mid).slice(0, 64),
      sdpMLineIndex: line === null || line < 0 || line > 64 ? null : line,
    },
  };
}

/** A relay channel pair for `slot`, sending through the hub. */
export function hubRelayPair(hub: HubLike, slot: number): RelayPair {
  return relayPair(slot, (packet) => {
    hub.emit('balatro:p2p:relay', packet as Uint8Array<ArrayBuffer>);
    return true;
  });
}

/** Decode an incoming relay frame (null for garbage). */
export function readRelay(bytes: Uint8Array): ReturnType<typeof decodeRelay> {
  return decodeRelay(bytes);
}
