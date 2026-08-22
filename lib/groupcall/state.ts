/**
 * The group-call state machine, as pure functions.
 *
 * Same argument as `lib/call/state.ts`, only more so: the bugs in a call are all
 * in the transitions, and a room of eight has a combinatorially larger supply of
 * them. Two people ending at once is one race; eight people joining, leaving,
 * muting and timing out against each other is a machine you cannot debug by
 * being on the call. So the rules live here — no sockets, no
 * `RTCPeerConnection`, no React — and are unit-testable in isolation.
 *
 * The server owns the authoritative copy; the client runs the same transitions
 * for its own UI. They agree because they share this file.
 *
 * ## What this machine deliberately does NOT model
 *
 * **Media.** In a 1:1 call "connected" is a single fact, so `lib/call/state.ts`
 * can have a `connecting` phase and a `connected` phase. In a mesh it is N-1
 * separate facts: Ana can hear Ben while Ben cannot hear Cara, and no single
 * phase is true of the room. Per-leg status therefore lives in
 * `GroupCallPeerView` (`lib/groupcall/types.ts`) and this machine's `active`
 * means only "we are on the roster of a live room". That is the one structural
 * difference from the 1:1 machine and every other difference follows from it.
 */

import { canCall, durationSeconds, formatDuration, type CallPrivacy } from '@/lib/call/state';
import {
  MAX_GROUP_CALL_PARTICIPANTS,
  type GroupCallEndReason,
  type GroupCallOrigin,
  type GroupCallParticipantView,
  type GroupCallRejectReason,
  type OpenRoomOrigin,
} from '@/lib/groupcall/events';

/**
 * Duration helpers, re-exported unchanged from the 1:1 machine.
 *
 * A call timer counts seconds the same way whether two people or eight are on
 * it, and `formatDuration`'s `m:ss` / `h:mm:ss` is already the format the
 * in-call chrome uses. Re-exporting keeps the group UI from importing across to
 * `lib/call/*` for one function while getting everything else from here.
 */
export { durationSeconds, formatDuration };
export type { CallPrivacy };

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Where we are with respect to one room.
 *
 * ### Why there is no separate pre-join phase for an ad-hoc host
 *
 * It is tempting to give the starter of an ad-hoc call a `ringing` phase, by
 * analogy with the 1:1 machine's `outgoing`. It would be wrong here. The host of
 * a group call is a **participant from the moment they press call** — they are
 * not waiting to be admitted, they are standing in a room waiting for company,
 * and if a second person joins before the first one answers nothing about the
 * host's own situation changes. "Somebody is still ringing" is a property of the
 * *roster* (participants whose `joinedAt` is `null`), not of the room, and
 * deriving it with `pendingInvitees()` means it stays true when the third
 * invitee is rung mid-call — which a phase could not express without a
 * transition that has no observable trigger.
 *
 * So `joining` covers "we have asked to be in a room and are not in it yet" for
 * the host and the invitee alike, exactly as `outgoing` and `incoming` both
 * collapse into `connecting` in the 1:1 machine once the answer lands.
 */
export type GroupCallPhase =
  /** Nothing happening. */
  | 'idle'
  /** An ad-hoc room is ringing us; the card is on screen. */
  | 'incoming'
  /** We asked to be in a room (started it, or accepted, or walked into an open one). */
  | 'joining'
  /** We are on the roster of a live room. Says nothing about any one peer's media. */
  | 'active'
  /** Terminal — a reason is set. */
  | 'ended';

export interface GroupCallState {
  phase: GroupCallPhase;
  /** `null` while a `START` is in flight — the server has not named the room yet. */
  callId: string | null;
  origin: GroupCallOrigin | null;
  /** Community/party id. `null` for `adhoc` and while idle. */
  originId: string | null;
  /** The DM thread an ad-hoc call started from, when it did. */
  conversationId: string | null;
  hostId: string | null;
  /** Our own userId. Needed here because {@link shouldOffer} is one half of a compare. */
  selfId: string | null;
  /**
   * The roster, keyed by userId.
   *
   * A plain record rather than a `Map` because it has to survive
   * `JSON.stringify` — it is read straight out of the Zustand store, it is what
   * SSR would have to hydrate, and a `Map` silently serialises to `{}`. A record
   * rather than an array because every operation on it is addressed by userId
   * (a signal from X, a mute for Y, Z left), which makes those O(1) and, more
   * importantly, **idempotent**: a duplicated `peer-joined` cannot produce two
   * rows, whereas an array needs a scan on every insert to promise the same. UI
   * order comes from {@link rosterList}, which sorts rather than relying on the
   * order things happened to arrive.
   */
  participants: Record<string, GroupCallParticipantView>;
  /** Set only in the `ended` phase. */
  endReason: GroupCallEndReason | null;
  /** Epoch ms we entered the room, for the call timer. */
  joinedAt: number | null;
  /** Our own mic state, as published to the room. */
  muted: boolean;
}

export const IDLE_GROUP_CALL: GroupCallState = {
  phase: 'idle',
  callId: null,
  origin: null,
  originId: null,
  conversationId: null,
  hostId: null,
  selfId: null,
  participants: {},
  endReason: null,
  joinedAt: null,
  muted: false,
};

export type GroupCallEvent =
  /**
   * We pressed call / open room. The server has not named the room yet, so
   * there is no id — the same reason `dial` exists in the 1:1 machine: every way
   * a start can be refused arrives as an `end`, and `end` is a no-op from
   * `idle`, so without a state to end a refusal showed the user nothing.
   */
  | {
      type: 'start';
      origin: GroupCallOrigin;
      originId: string | null;
      conversationId: string | null;
      selfId: string;
    }
  /** An ad-hoc room is ringing us. */
  | {
      type: 'incoming';
      callId: string;
      origin: GroupCallOrigin;
      originId: string | null;
      conversationId: string | null;
      hostId: string;
      selfId: string;
      participants: GroupCallParticipantView[];
    }
  /**
   * We asked to enter a room we can name — accepting a ring, or walking into an
   * open room found by `LOOKUP`. Covers what a separate `accept` would have.
   */
  | { type: 'join'; callId: string }
  /** The server put us in. Authoritative: this is what fills in the room. */
  | {
      type: 'joined';
      callId: string;
      origin: GroupCallOrigin;
      originId: string | null;
      conversationId: string | null;
      hostId: string;
      selfId: string;
      participants: GroupCallParticipantView[];
      at: number;
    }
  /** Full authoritative roster snapshot. Replaces what we had. */
  | { type: 'roster'; callId: string; participants: GroupCallParticipantView[] }
  | { type: 'peer-joined'; participant: GroupCallParticipantView }
  | { type: 'peer-left'; userId: string }
  /** Somebody else's published mute changed. */
  | { type: 'peer-muted'; userId: string; muted: boolean }
  /** Our own mute changed. */
  | { type: 'set-muted'; muted: boolean }
  | { type: 'end'; reason: GroupCallEndReason }
  /** Dismiss a terminal room and go back to idle. */
  | { type: 'reset' };

/* -------------------------------------------------------------------------- */
/* Predicates                                                                 */
/* -------------------------------------------------------------------------- */

/** Phases in which a new call cannot be started or received. */
export function isGroupCallBusy(state: GroupCallState): boolean {
  return state.phase !== 'idle' && state.phase !== 'ended';
}

/**
 * Whether audio should be captured in this phase.
 *
 * `joining` counts and `incoming` does not: the microphone prompt belongs to the
 * moment the user pressed Join, never to the moment somebody else's room started
 * ringing.
 */
export function wantsMicrophone(phase: GroupCallPhase): boolean {
  return phase === 'joining' || phase === 'active';
}

/**
 * Which side makes the offer, for a pair.
 *
 * Exactly one peer of every pair must offer; if both do, the two negotiations
 * collide and neither completes — WebRTC calls this **glare**. Comparing the two
 * identifiers gives a rule that is total, deterministic, and needs no round
 * trip: it is the same rule `lib/massive-march/voice.ts` already runs, and the
 * only change is that the identifiers are userIds rather than socket ids, so it
 * survives a reconnect that hands the same user a new socket.
 *
 * Both the client and the server evaluate this, from the same function, so the
 * server can reject an offer nobody should have sent.
 *
 * Returns `false` for `selfUserId === peerUserId` — nobody offers to themselves,
 * and a self-entry on the roster must never produce a peer connection.
 */
export function shouldOffer(selfUserId: string, peerUserId: string): boolean {
  return selfUserId < peerUserId;
}

/* -------------------------------------------------------------------------- */
/* Roster                                                                     */
/* -------------------------------------------------------------------------- */

/** Index a roster array by userId. Later entries win, so a snapshot is self-healing. */
export function indexRoster(
  participants: readonly GroupCallParticipantView[],
): Record<string, GroupCallParticipantView> {
  const out: Record<string, GroupCallParticipantView> = {};
  for (const p of participants) out[p.userId] = p;
  return out;
}

/**
 * The roster in render order: people who are actually in, oldest first, then
 * anyone still ringing.
 *
 * Sorting rather than preserving arrival order is what stops the tiles from
 * reshuffling when a snapshot arrives in a different order from the deltas that
 * built the same roster.
 */
export function rosterList(state: GroupCallState): GroupCallParticipantView[] {
  return Object.values(state.participants).sort((a, b) => {
    if (a.joinedAt === null && b.joinedAt === null) return a.userId < b.userId ? -1 : 1;
    // Still ringing sorts last: the room is the people in it.
    if (a.joinedAt === null) return 1;
    if (b.joinedAt === null) return -1;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.userId < b.userId ? -1 : 1;
  });
}

/** Everyone on the roster who is actually in the room. */
export function joinedParticipants(state: GroupCallState): GroupCallParticipantView[] {
  return rosterList(state).filter((p) => p.joinedAt !== null);
}

/** Ad-hoc only: invited, still ringing, not in yet. */
export function pendingInvitees(state: GroupCallState): GroupCallParticipantView[] {
  return rosterList(state).filter((p) => p.joinedAt === null);
}

/**
 * How many people are in the room.
 *
 * Counts the joined only. Invitees who are still ringing do not occupy a slot,
 * because a room that is "full" of people who have not answered is a room nobody
 * can join.
 */
export function participantCount(state: GroupCallState): number {
  let n = 0;
  for (const id in state.participants) {
    if (state.participants[id].joinedAt !== null) n += 1;
  }
  return n;
}

/** Would one more person exceed {@link MAX_GROUP_CALL_PARTICIPANTS}? */
export function isRosterFull(stateOrCount: GroupCallState | number): boolean {
  const count = typeof stateOrCount === 'number' ? stateOrCount : participantCount(stateOrCount);
  return count >= MAX_GROUP_CALL_PARTICIPANTS;
}

/** How many more people would fit. Never negative. */
export function remainingSlots(state: GroupCallState): number {
  return Math.max(0, MAX_GROUP_CALL_PARTICIPANTS - participantCount(state));
}

/** Everyone we should hold a peer connection to: joined, and not us. */
export function meshPeers(state: GroupCallState): GroupCallParticipantView[] {
  return joinedParticipants(state).filter((p) => p.userId !== state.selfId);
}

/** Add or replace one roster row. Idempotent. */
export function addParticipant(
  participants: Record<string, GroupCallParticipantView>,
  participant: GroupCallParticipantView,
): Record<string, GroupCallParticipantView> {
  return { ...participants, [participant.userId]: participant };
}

/** Drop one roster row. A no-op — and the same object — if they were not there. */
export function removeParticipant(
  participants: Record<string, GroupCallParticipantView>,
  userId: string,
): Record<string, GroupCallParticipantView> {
  if (!(userId in participants)) return participants;
  const next = { ...participants };
  delete next[userId];
  return next;
}

/**
 * Set one participant's published mute.
 *
 * A mute for somebody who is not on the roster is dropped rather than creating a
 * ghost row: the roster is the server's to populate, and a stray state event
 * from a peer who has since left must not put them back on screen.
 */
export function setParticipantMuted(
  participants: Record<string, GroupCallParticipantView>,
  userId: string,
  muted: boolean,
): Record<string, GroupCallParticipantView> {
  const current = participants[userId];
  if (!current || current.muted === muted) return participants;
  return { ...participants, [userId]: { ...current, muted } };
}

/**
 * Mark a ringing invitee as having joined.
 *
 * Separate from `addParticipant` because the server sends the full row on join
 * anyway; this exists for the client-side optimistic path and for tests.
 */
export function markJoined(
  participants: Record<string, GroupCallParticipantView>,
  userId: string,
  at: number,
): Record<string, GroupCallParticipantView> {
  const current = participants[userId];
  if (!current || current.joinedAt !== null) return participants;
  return { ...participants, [userId]: { ...current, joinedAt: at } };
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Apply an event.
 *
 * Unknown transitions are **ignored rather than thrown**, for the reason
 * `lib/call/state.ts` gives and one more: in a mesh, messages about people who
 * have already left are not an edge case, they are the steady state during any
 * churn. A machine that threw on a late `peer-muted` would crash a tab in the
 * middle of a call every time somebody hung up while talking. Every ignored
 * transition is a no-op that returns the previous state object unchanged, which
 * also means a store using reference equality re-renders nothing.
 */
export function reduce(state: GroupCallState, event: GroupCallEvent): GroupCallState {
  switch (event.type) {
    case 'start':
      // A second start while busy is dropped; the UI already shows the room.
      if (isGroupCallBusy(state)) return state;
      return {
        ...IDLE_GROUP_CALL,
        phase: 'joining',
        callId: null,
        origin: event.origin,
        originId: event.originId,
        conversationId: event.conversationId,
        selfId: event.selfId,
        // The host is a participant from the first instant, but the server owns
        // the roster and will send it with `joined`. Staying empty here keeps
        // one source of truth rather than two that have to agree.
        participants: {},
      };

    case 'incoming':
      if (isGroupCallBusy(state)) return state;
      return {
        ...IDLE_GROUP_CALL,
        phase: 'incoming',
        callId: event.callId,
        origin: event.origin,
        originId: event.originId,
        conversationId: event.conversationId,
        hostId: event.hostId,
        selfId: event.selfId,
        participants: indexRoster(event.participants),
      };

    case 'join':
      // From `incoming`: we accepted, and it must be the room that is ringing —
      // an accept aimed at a different callId is a stale click on a card that
      // has since been replaced.
      if (state.phase === 'incoming') {
        if (state.callId !== event.callId) return state;
        return { ...state, phase: 'joining' };
      }
      // From `idle`/`ended`: walking into an open room we already know the id of.
      if (state.phase === 'idle' || state.phase === 'ended') {
        return { ...IDLE_GROUP_CALL, phase: 'joining', callId: event.callId };
      }
      // Already joining or active — a duplicate press, or a join aimed
      // elsewhere. Neither may disturb the room we are in.
      return state;

    case 'joined':
      // Only meaningful while we are trying to get in. A `joined` that lands
      // after we gave up (or after the room ended) must not resurrect it.
      if (state.phase !== 'joining') return state;
      return {
        ...state,
        phase: 'active',
        callId: event.callId,
        origin: event.origin,
        originId: event.originId,
        conversationId: event.conversationId,
        hostId: event.hostId,
        selfId: event.selfId,
        participants: indexRoster(event.participants),
        joinedAt: event.at,
      };

    case 'roster':
      // Snapshots are only trusted for the room we believe we are in, and only
      // once we are in it — a snapshot cannot be what puts us on the roster.
      if (state.phase !== 'active' || state.callId !== event.callId) return state;
      return { ...state, participants: indexRoster(event.participants) };

    case 'peer-joined': {
      // `incoming` accepts them too, so the ringing card's "and 2 others" stays
      // right while the user decides.
      if (state.phase !== 'active' && state.phase !== 'incoming') return state;
      const participants = addParticipant(state.participants, event.participant);
      if (participants === state.participants) return state;
      return { ...state, participants };
    }

    case 'peer-left': {
      if (state.phase !== 'active' && state.phase !== 'incoming') return state;
      const participants = removeParticipant(state.participants, event.userId);
      if (participants === state.participants) return state;
      return { ...state, participants };
    }

    case 'peer-muted': {
      const participants = setParticipantMuted(state.participants, event.userId, event.muted);
      if (participants === state.participants) return state;
      return { ...state, participants };
    }

    case 'set-muted':
      // Settable from `joining` as well as `active`: muting yourself before the
      // room finishes admitting you is a normal thing to want, and the value is
      // published when the join completes.
      if (state.phase !== 'joining' && state.phase !== 'active') return state;
      if (state.muted === event.muted) return state;
      return { ...state, muted: event.muted };

    case 'end':
      // Terminal from anywhere except idle. Ending an already-ended room keeps
      // the FIRST reason: if we left and the host ended it in the same instant,
      // the reason the user already saw is the one that stays on screen.
      if (state.phase === 'idle' || state.phase === 'ended') return state;
      return { ...state, phase: 'ended', endReason: event.reason };

    case 'reset':
      return IDLE_GROUP_CALL;

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Who may be rung, and who may walk in                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whether the starter of an **ad-hoc** group call may ring this person.
 *
 * Delegates to `canCall` from `lib/call/state.ts` — imported rather than
 * reimplemented, and deliberately not relaxed. The temptation is to argue that a
 * group call is more social and so should be easier to be pulled into; the
 * opposite is true. Being rung by a group is not less intrusive than being rung
 * by one person, and it is a strictly better vector: a stranger who cannot ring
 * you alone must not be able to ring you by adding you to a room with someone
 * you do follow. One rule for both features means a change to the privacy
 * setting cannot silently fail to apply here.
 *
 * Evaluated **once per invitee**, not once per call, so a room with five
 * invitees runs it five times and refuses only the people it applies to.
 */
export function canJoinGroupCall(args: {
  privacy: CallPrivacy;
  /** Either direction of block bars the ring. */
  blocked: boolean;
  /** Does the INVITEE follow the STARTER? */
  calleeFollowsCaller: boolean;
}): { allowed: true } | { allowed: false; reason: 'blocked' | 'privacy' } {
  return canCall(args);
}

/**
 * Whether someone may walk into an **open** community/party room.
 *
 * A completely different rule, and it has to be: nobody is being rung, so there
 * is nothing to protect them *from*. What is being protected is the room, and
 * the only question is whether this person belongs to the thing the room is
 * scoped to. Call privacy is not consulted at all — it answers "may this person
 * make my phone ring", which nobody here is doing.
 *
 * Order is deliberate. A ban is checked before membership so that a banned
 * member gets the ban and not a confusing "not a member", and both are checked
 * before capacity so that a person who was never getting in is not told the room
 * is merely full — which would be an invitation to keep retrying.
 */
export function canJoinOpenRoom(args: {
  origin: OpenRoomOrigin;
  /** Member of the community, or in the party. */
  isMember: boolean;
  /** Banned from the community, or blocked by the party leader. */
  banned?: boolean;
  /** Current joined count, from {@link participantCount}. */
  participantCount: number;
}): { allowed: true } | { allowed: false; reason: GroupCallRejectReason } {
  if (args.banned) return { allowed: false, reason: 'blocked' };
  if (!args.isMember) return { allowed: false, reason: 'not-member' };
  if (isRosterFull(args.participantCount)) return { allowed: false, reason: 'full' };
  return { allowed: true };
}

/* -------------------------------------------------------------------------- */
/* Persistence mapping                                                        */
/* -------------------------------------------------------------------------- */

/** Wire origin → the `GroupCallOrigin` Prisma enum. */
export function persistedOrigin(origin: GroupCallOrigin): 'ADHOC' | 'COMMUNITY' | 'PARTY' {
  switch (origin) {
    case 'adhoc':
      return 'ADHOC';
    case 'community':
      return 'COMMUNITY';
    case 'party':
      return 'PARTY';
  }
}

/**
 * Map a terminal reason onto the `GroupCallStatus` persisted for history.
 *
 * `everJoined` is "did anyone other than the host ever get in" — the distinction
 * between a call that happened and one that did not, which is the only thing the
 * conversation row is trying to say.
 */
export function persistedStatus(
  reason: GroupCallEndReason,
  everJoined: boolean,
): 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED' | 'FAILED' {
  if (everJoined) return 'ENDED';
  switch (reason) {
    case 'declined':
      return 'DECLINED';
    case 'unanswered':
      return 'MISSED';
    case 'failed':
      return 'FAILED';
    // A room nobody else reached, closed by the host or by its own emptiness, is
    // a call that did not happen.
    case 'host-ended':
    case 'left':
    case 'empty':
      return 'MISSED';
    // Refusals never opened a room from the other side's point of view. Recorded
    // as missed rather than inventing a status that would leak the reason into
    // somebody's history — same reasoning as the 1:1 machine.
    case 'blocked':
    case 'privacy':
    case 'not-member':
    case 'busy':
    case 'full':
    case 'gone':
      return 'MISSED';
  }
}

/**
 * Map one participant's outcome onto the `GroupCallParticipantStatus` enum.
 *
 * `joined` is what actually happened; the reason only decides how a never-joined
 * row is described.
 */
export function persistedParticipantStatus(args: {
  joined: boolean;
  left: boolean;
  reason?: GroupCallEndReason;
}): 'INVITED' | 'JOINED' | 'LEFT' | 'DECLINED' | 'MISSED' | 'FAILED' {
  if (args.joined) return args.left ? 'LEFT' : 'JOINED';
  switch (args.reason) {
    case 'declined':
      return 'DECLINED';
    case 'unanswered':
      return 'MISSED';
    case 'failed':
      return 'FAILED';
    default:
      return 'INVITED';
  }
}
