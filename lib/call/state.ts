/**
 * The call state machine, as pure functions.
 *
 * Calls are the kind of feature where the bugs are all in the transitions:
 * both sides hanging up at once, an accept arriving after the ring timed out, a
 * second invite while one is already in flight, ICE failing after the callee
 * picked up. Keeping the rules here — with no sockets, no `RTCPeerConnection`
 * and no React — is what makes those cases testable instead of a thing you
 * discover on a phone call with someone.
 *
 * The server owns the authoritative copy of this machine; the client runs the
 * same transitions for its own UI. They agree because they share this file.
 */

import type { CallEndReason } from '@/lib/call/events';

export type CallPhase =
  /** Nothing happening. */
  | 'idle'
  /** We are the caller; invite sent, waiting for an answer. */
  | 'outgoing'
  /** We are the callee; their invite is on screen. */
  | 'incoming'
  /** Answered; negotiating the peer connection. Audio not flowing yet. */
  | 'connecting'
  /** Media is flowing. */
  | 'connected'
  /** Terminal — a reason is set. */
  | 'ended';

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  /** The other participant. */
  peerId: string | null;
  conversationId: string | null;
  /** Set only in the `ended` phase. */
  endReason: CallEndReason | null;
  /** Epoch ms when media connected, for the duration readout. */
  connectedAt: number | null;
  /** Our own mic state. */
  muted: boolean;
  /** Their mic state, as last reported. */
  peerMuted: boolean;
}

export const IDLE: CallState = {
  phase: 'idle',
  callId: null,
  peerId: null,
  conversationId: null,
  endReason: null,
  connectedAt: null,
  muted: false,
  peerMuted: false,
};

export type CallEvent =
  /** We pressed call. The server has not answered yet, so there is no id. */
  | { type: 'dial'; peerId: string; conversationId: string | null }
  /** The server placed the invite and named it; it is ringing on their side. */
  | { type: 'ringing'; callId: string }
  | { type: 'incoming'; callId: string; peerId: string; conversationId: string | null }
  /** The callee pressed accept (either side observes this). */
  | { type: 'accepted' }
  /** ICE reached a connected state. */
  | { type: 'media-connected'; at: number }
  | { type: 'end'; reason: CallEndReason }
  | { type: 'set-muted'; muted: boolean }
  | { type: 'peer-muted'; muted: boolean }
  /** Dismiss a terminal call and go back to idle. */
  | { type: 'reset' };

/** Phases in which a new call cannot be started or received. */
export function isBusy(state: CallState): boolean {
  return state.phase !== 'idle' && state.phase !== 'ended';
}

/** Whether audio should be captured and flowing in this phase. */
export function wantsMicrophone(phase: CallPhase): boolean {
  return phase === 'connecting' || phase === 'connected' || phase === 'outgoing';
}

/**
 * Apply an event.
 *
 * Unknown transitions are **ignored rather than thrown**: signalling is racy by
 * nature — a `hangup` and a `decline` genuinely can cross on the wire — and a
 * state machine that throws on a late message would turn a normal race into a
 * crashed tab mid-call. Every ignored transition is a no-op that leaves the
 * previous state intact.
 */
export function reduce(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case 'dial':
      // A second dial while busy is dropped; the caller's UI already reflects
      // the call in progress.
      if (isBusy(state)) return state;
      // `outgoing` starts here rather than when the server confirms, because
      // every way an invite can be refused — offline, busy, privacy, a block —
      // arrives as an `end`, and `end` is a no-op from `idle`. Without a state
      // to end, a call that could never be placed showed the caller nothing.
      return {
        ...IDLE,
        phase: 'outgoing',
        callId: null,
        peerId: event.peerId,
        conversationId: event.conversationId,
      };

    case 'ringing':
      // Fills in the id we were dialling without one. It never starts a call,
      // so a stray `ringing` cannot resurrect an ended one or rename a live one.
      if (state.phase !== 'outgoing' || state.callId !== null) return state;
      return { ...state, callId: event.callId };

    case 'incoming':
      if (isBusy(state)) return state;
      return {
        ...IDLE,
        phase: 'incoming',
        callId: event.callId,
        peerId: event.peerId,
        conversationId: event.conversationId,
      };

    case 'accepted':
      // Only meaningful while ringing. An accept that arrives after the call
      // already ended (a race with the ring timeout) is dropped.
      if (state.phase !== 'outgoing' && state.phase !== 'incoming') return state;
      return { ...state, phase: 'connecting' };

    case 'media-connected':
      if (state.phase !== 'connecting') return state;
      return { ...state, phase: 'connected', connectedAt: event.at };

    case 'end':
      // Terminal from anywhere except idle. Ending an already-ended call keeps
      // the FIRST reason: if we hung up and they declined simultaneously, the
      // reason we already showed the user is the one that stays on screen.
      if (state.phase === 'idle' || state.phase === 'ended') return state;
      return { ...state, phase: 'ended', endReason: event.reason };

    case 'set-muted':
      if (!isBusy(state)) return state;
      return { ...state, muted: event.muted };

    case 'peer-muted':
      if (!isBusy(state)) return state;
      return { ...state, peerMuted: event.muted };

    case 'reset':
      return IDLE;

    default:
      return state;
  }
}

/**
 * Map a terminal reason onto the `CallStatus` persisted for history.
 *
 * `connected` decides between "we talked" and "we didn't", which is the
 * distinction the conversation row is actually showing.
 */
export function persistedStatus(
  reason: CallEndReason,
  connected: boolean,
): 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELLED' | 'BUSY' | 'FAILED' {
  if (connected) return 'ENDED';
  switch (reason) {
    case 'declined':
      return 'DECLINED';
    case 'cancelled':
      return 'CANCELLED';
    case 'busy':
      return 'BUSY';
    case 'missed':
      return 'MISSED';
    case 'failed':
      return 'FAILED';
    // A call refused for privacy/blocking never rang, so from the callee's
    // point of view it did not happen. Recorded as missed rather than inventing
    // a status that would leak the refusal reason into their history.
    case 'blocked':
    case 'privacy':
    case 'offline':
      return 'MISSED';
    case 'hangup':
      return 'CANCELLED';
  }
}

/** Talk time in whole seconds. Zero unless the call actually connected. */
export function durationSeconds(connectedAt: number | null, endedAt: number): number {
  if (!connectedAt) return 0;
  return Math.max(0, Math.round((endedAt - connectedAt) / 1000));
}

/** `m:ss` / `h:mm:ss` for the in-call timer. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Who may call whom                                                          */
/* -------------------------------------------------------------------------- */

export type CallPrivacy = 'everyone' | 'following' | 'nobody';

export const CALL_PRIVACY_VALUES: readonly CallPrivacy[] = ['everyone', 'following', 'nobody'];

export function isCallPrivacy(v: unknown): v is CallPrivacy {
  return typeof v === 'string' && (CALL_PRIVACY_VALUES as readonly string[]).includes(v);
}

/**
 * Whether `callerId` may ring the callee.
 *
 * Ordering matters and is deliberate: a block wins over everything, including
 * an `everyone` setting, because a blocked user must not be able to make a
 * stranger's phone ring. `following` means *the callee follows the caller* —
 * not the other way round — so the permission is granted by the person being
 * called, which is the only direction that is safe.
 */
export function canCall(args: {
  privacy: CallPrivacy;
  /** Either direction of block bars the call. */
  blocked: boolean;
  /** Does the CALLEE follow the CALLER? */
  calleeFollowsCaller: boolean;
}): { allowed: true } | { allowed: false; reason: 'blocked' | 'privacy' } {
  if (args.blocked) return { allowed: false, reason: 'blocked' };
  if (args.privacy === 'nobody') return { allowed: false, reason: 'privacy' };
  if (args.privacy === 'following' && !args.calleeFollowsCaller) {
    return { allowed: false, reason: 'privacy' };
  }
  return { allowed: true };
}
