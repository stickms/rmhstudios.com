/**
 * Voice-call signalling contract.
 *
 * ## Why this is small
 *
 * A 1:1 call is plain peer-to-peer WebRTC: the two browsers negotiate a
 * connection and send audio directly to each other. Our server never carries
 * audio, so it needs to do exactly one job — pass a handful of small JSON blobs
 * between two sockets while they work out how to reach each other. That is what
 * these events are.
 *
 * The group-audio design in `docs/plans/2026-07-19-platform-expansion-design.md`
 * §4 correctly reached for a self-hosted LiveKit SFU, because one speaker
 * fanning out to hundreds of listeners genuinely needs a media server. Two
 * people do not, which is why this ships without one.
 *
 * ## Rate limits
 *
 * Every inbound name below must appear in `SOCKET_RATE_LIMITS`
 * (`server/socket-server/config.ts`) — that map doubles as the inbound-event
 * allowlist, so an unlisted event is silently dropped.
 */

/** Client → server. */
export const CALL_C2S = {
  /** Start ringing someone. */
  INVITE: 'call:invite',
  /** Callee picked up. */
  ACCEPT: 'call:accept',
  /** Callee actively refused. */
  DECLINE: 'call:decline',
  /** Caller gave up before it was answered. */
  CANCEL: 'call:cancel',
  /** Either side hung up after connecting. */
  HANGUP: 'call:hangup',
  /** SDP offer/answer relay. */
  SIGNAL: 'call:signal',
  /** ICE candidate relay (separate: these are chatty and need a higher limit). */
  ICE: 'call:ice',
  /** Mute state, so the other side can show it. */
  MUTE: 'call:mute',
} as const;

/** Server → client. */
export const CALL_S2C = {
  /** You are being called. */
  INCOMING: 'call:incoming',
  /** Your invite reached a live device and is ringing. */
  RINGING: 'call:ringing',
  /** They picked up — start the WebRTC offer. */
  ACCEPTED: 'call:accepted',
  /** SDP relay from the other side. */
  SIGNAL: 'call:signal',
  /** ICE relay from the other side. */
  ICE: 'call:ice',
  /** The call is over, with a reason. */
  ENDED: 'call:ended',
  /** The other side muted or unmuted. */
  MUTE: 'call:mute',
  /** The invite could not be placed at all (privacy, block, busy, offline). */
  REJECTED: 'call:rejected',
} as const;

/** Why a call ended. Drives the copy shown in the conversation afterwards. */
export type CallEndReason =
  | 'hangup'
  | 'declined'
  | 'cancelled'
  | 'missed'
  | 'busy'
  | 'failed'
  | 'blocked'
  | 'privacy'
  | 'offline';

/** Why an invite never started ringing. */
export type CallRejectReason = Extract<CallEndReason, 'blocked' | 'privacy' | 'busy' | 'offline'>;

export interface CallPeer {
  id: string;
  name: string;
  image: string | null;
  handle: string | null;
}

export interface CallInvitePayload {
  /** Who to ring. */
  calleeId: string;
  /** The DM thread this started from, when it did. */
  conversationId?: string;
}

export interface CallIncomingPayload {
  callId: string;
  from: CallPeer;
  conversationId: string | null;
}

export interface CallSignalPayload {
  callId: string;
  /** An `RTCSessionDescriptionInit`, passed through opaquely. */
  description: { type: 'offer' | 'answer'; sdp: string };
}

export interface CallIcePayload {
  callId: string;
  /** An `RTCIceCandidateInit`, passed through opaquely. */
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export interface CallEndedPayload {
  callId: string;
  reason: CallEndReason;
  /** Talk time, present when the call had connected. */
  durationSec?: number;
}

/**
 * How long an unanswered call rings before it becomes a missed call.
 *
 * Server-authoritative: the caller's client shows a matching countdown, but the
 * server is what actually gives up, so a client that ignores the timer cannot
 * ring someone indefinitely.
 */
export const RING_TIMEOUT_MS = 45_000;

/** Ceiling on a single SDP blob, to keep the relay from becoming a pipe. */
export const MAX_SDP_BYTES = 64 * 1024;
export const MAX_ICE_BYTES = 4 * 1024;
