/**
 * Group voice-call signalling contract.
 *
 * ## Why this is a mesh, and why it stops at eight
 *
 * A group call here is a **full WebRTC mesh**: every participant holds a direct
 * peer connection to every other participant, and the server never carries a
 * sample. That is the same shape as `lib/massive-march/voice.ts`, which already
 * runs a mesh in this repo, and the same reason `lib/call/events.ts` ships
 * without an SFU — a media server is a thing you have to run, size and pay for,
 * and it earns that cost only when one speaker fans out to an audience.
 *
 * The cost of a mesh is quadratic and it is paid by the clients, not by us. In
 * a room of N, each browser uploads N-1 copies of its own microphone and decodes
 * N-1 incoming streams. At Opus-for-speech rates (~32 kbit/s per stream) eight
 * people is roughly 224 kbit/s up and the same down per participant, plus seven
 * `RTCPeerConnection`s and seven decoders — comfortably inside what a laptop or
 * a mid-range phone on a normal connection will do. Twelve is where the weakest
 * device in the room starts deciding the experience for everyone else, and
 * sixteen is where the answer is an SFU rather than a bigger constant. Hence
 * {@link MAX_GROUP_CALL_PARTICIPANTS} = 8: a hard cap the server enforces, not a
 * hint. If the product ever wants a room of forty, that is a media-server
 * project and not a change to this number.
 *
 * ## What makes this a mesh rather than a relay
 *
 * Every SDP and every ICE candidate on this contract names its counterpart.
 * Client→server payloads carry an explicit `to` userId; server→client payloads
 * carry an explicit `from`. There is no "the other side" here — a signal without
 * an addressee is meaningless in a room of five, so the server rejects one.
 *
 * ## Identity is the userId, never the socket id
 *
 * A participant is a **user**, so the roster can show a name and an avatar, and
 * so a user with three tabs open rings in all three and joins from whichever one
 * they answer. The server tracks which single socket is that user's *media*
 * socket and routes signalling there; nothing on this wire format mentions
 * sockets.
 *
 * ## Audio only
 *
 * There is no video in this contract and no place to put it. Eight simultaneous
 * inbound video decodes is a different engineering problem with a different
 * answer (simulcast, an SFU, layer selection), and pretending otherwise by
 * leaving a hole for it would be a promise this design cannot keep.
 *
 * ## Relationship to 1:1 calls
 *
 * Separate feature, separate `gcall:` prefix, separate tables. `lib/call/*` and
 * its socket handler are untouched. What is shared is the small set of things
 * that are genuinely the same physical facts — {@link CallPeer}, the SDP/ICE
 * size ceilings, and the ICE server plumbing in `lib/call/ice.ts` — imported
 * rather than copied, because a divergence in those would be a bug in both.
 *
 * ## Rate limits
 *
 * Every inbound name below must appear in `SOCKET_RATE_LIMITS`
 * (`server/socket-server/config.ts`) — that map doubles as the inbound-event
 * allowlist, so an unlisted event is silently dropped.
 *
 * This is a plain, client-safe module: no server-only imports, no `node:*`, no
 * Prisma. Both bundles import the same strings so they can never drift.
 */

import { MAX_ICE_BYTES, MAX_SDP_BYTES, type CallPeer } from '@/lib/call/events';

/**
 * The minimal user shape shown for a participant, reused verbatim from the 1:1
 * contract.
 *
 * Re-exported rather than redeclared: the incoming-call card for an ad-hoc group
 * call shows the same four fields about the same kind of person as the 1:1 one,
 * and two structurally identical interfaces that are allowed to drift is how a
 * shared component ends up with two prop types.
 */
export type { CallPeer };

/**
 * Ceilings on a single relayed blob.
 *
 * Imported from `lib/call/events.ts` rather than redeclared. The coupling is
 * worth a moment's thought and the answer is that it is the right one: these
 * bound the size of an `RTCSessionDescription` and an `RTCIceCandidate`, which
 * are properties of WebRTC and of a single audio m-line — not properties of the
 * 1:1 feature. A mesh SDP is no larger than a 1:1 SDP because it describes the
 * same one microphone. Two copies of the same physical constant is how you end
 * up with one relay accepting what the other rejects.
 *
 * The dependency runs one way (`groupcall` → `call`) into a leaf module with no
 * imports of its own, so it costs nothing structurally.
 */
export { MAX_SDP_BYTES, MAX_ICE_BYTES };

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/** Client → server. */
export const GCALL_C2S = {
  /** Open a room. Rings invitees for `adhoc`; joins or creates the open room for a community/party. */
  START: 'gcall:start',
  /** Ring more people into a room that is already running. */
  INVITE: 'gcall:invite',
  /** Accept a ring, or walk into an open room. Always by `callId`. */
  JOIN: 'gcall:join',
  /** Refuse a ring without joining. */
  DECLINE: 'gcall:decline',
  /** Leave a room that carries on without us. */
  LEAVE: 'gcall:leave',
  /** Host only: end the room for everyone in it. */
  END: 'gcall:end',
  /** SDP offer/answer relay to one named peer. */
  SIGNAL: 'gcall:signal',
  /** ICE candidate relay to one named peer (separate: chatty, higher limit). */
  ICE: 'gcall:ice',
  /** Our own mute state, so the roster can show it. */
  STATE: 'gcall:state',
  /** Is there a live open room for this community/party? */
  LOOKUP: 'gcall:lookup',
} as const;

/** Server → client. */
export const GCALL_S2C = {
  /** An ad-hoc room is ringing you. */
  INCOMING: 'gcall:incoming',
  /** Authoritative roster snapshot. Replaces whatever the client had. */
  ROSTER: 'gcall:roster',
  /** You are in. Carries the room and the roster as of this instant. */
  JOINED: 'gcall:joined',
  /** Someone joined (or was invited and is now ringing). */
  PEER_JOINED: 'gcall:peer-joined',
  /** Someone is gone — tear their peer connection down. */
  PEER_LEFT: 'gcall:peer-left',
  /** SDP relay from one named peer. */
  SIGNAL: 'gcall:signal',
  /** ICE relay from one named peer. */
  ICE: 'gcall:ice',
  /** A participant muted or unmuted. */
  STATE: 'gcall:state',
  /** The room is over for everyone, with a reason. */
  ENDED: 'gcall:ended',
  /** Your start/join/invite could not be performed at all. */
  REJECTED: 'gcall:rejected',
  /** Open-room presence: the answer to LOOKUP, and pushed when a room opens or closes. */
  ACTIVE: 'gcall:active',
  /** Recoverable protocol-level error surfaced to the acting socket. */
  ERROR: 'gcall:error',
} as const;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Where a call came from — which is also the only thing that decides how people
 * get into it.
 *
 * - `adhoc` — started from a DM or a profile. Invitees are **rung**: they get an
 *   incoming call and accept or decline. The starter is the host.
 * - `community` / `party` — an **open voice room** scoped to that community or
 *   party. Nobody is rung; eligible members walk in. The roster is whoever
 *   happens to have joined.
 *
 * Lowercase on the wire; the Prisma enum is `ADHOC | COMMUNITY | PARTY` and
 * `persistedOrigin()` in `lib/groupcall/state.ts` maps between them.
 */
export type GroupCallOrigin = 'adhoc' | 'community' | 'party';

export const GROUP_CALL_ORIGINS: readonly GroupCallOrigin[] = ['adhoc', 'community', 'party'];

export function isGroupCallOrigin(v: unknown): v is GroupCallOrigin {
  return typeof v === 'string' && (GROUP_CALL_ORIGINS as readonly string[]).includes(v);
}

/** The two origins that produce an open room rather than a ring. */
export type OpenRoomOrigin = Extract<GroupCallOrigin, 'community' | 'party'>;

/**
 * Why a room ended, or why we are no longer in one.
 *
 * Drives the copy on the ended-call card and, for `adhoc`, the row left behind
 * in the conversation.
 */
export type GroupCallEndReason =
  /** The host ended it for everyone. */
  | 'host-ended'
  /** We left. The room may well still be running without us. */
  | 'left'
  /** The last participant left, so the room closed itself. */
  | 'empty'
  /** Ad-hoc: everyone who was rung declined. */
  | 'declined'
  /** Ad-hoc: it rang out and nobody joined. */
  | 'unanswered'
  /** Signalling or ICE never came up — the honest outcome with no TURN. */
  | 'failed'
  /** The room was already at {@link MAX_GROUP_CALL_PARTICIPANTS}. */
  | 'full'
  /** The room no longer exists (ended, or lost to a hub restart). */
  | 'gone'
  /** We are already in a call. */
  | 'busy'
  /** A block, either direction. */
  | 'blocked'
  /** The host's (or invitee's) call-privacy setting refused it. */
  | 'privacy'
  /** Not a member of the community/party the room is scoped to. */
  | 'not-member';

/**
 * Why a start/join/invite never happened at all.
 *
 * A strict subset of {@link GroupCallEndReason}, the same way `CallRejectReason`
 * is of `CallEndReason`, so a rejection can be fed straight into the same
 * `end` transition without a translation table.
 */
export type GroupCallRejectReason = Extract<
  GroupCallEndReason,
  'blocked' | 'privacy' | 'not-member' | 'full' | 'gone' | 'busy' | 'failed'
>;

/** Why one participant is no longer on the roster. */
export type GroupCallLeaveReason =
  /** They left, or their last device disconnected past the grace window. */
  | 'left'
  /** Ad-hoc: they were ringing and refused. */
  | 'declined'
  /** Ad-hoc: they were ringing and never answered. */
  | 'unanswered'
  /** Their media never came up. */
  | 'failed';

/**
 * Protocol-level failures, as distinct from {@link GroupCallRejectReason}, which
 * is about a request being *refused*. These mean the request was malformed,
 * throttled, or aimed at something that is not ours to touch.
 */
export type GroupCallErrorCode =
  | 'unauthenticated'
  | 'rate-limited'
  /** An SDP or candidate over {@link MAX_SDP_BYTES} / {@link MAX_ICE_BYTES}. */
  | 'too-large'
  | 'malformed'
  /** No such room, or it has ended. */
  | 'unknown-call'
  /** We are not on this room's roster, so we may not signal into it. */
  | 'not-participant'
  /** Host-only action attempted by someone who is not the host. */
  | 'not-host'
  /** Named a `to`/`userId` who is not on the roster. */
  | 'unknown-peer';

/**
 * One row of the roster.
 *
 * Keyed on `userId` rather than `CallPeer`'s `id` on purpose: "peer identity is
 * the userId, not the socket id" is the load-bearing decision of this whole
 * feature, and a field called `userId` is the one place it cannot be misread.
 */
export interface GroupCallParticipantView {
  userId: string;
  name: string;
  image: string | null;
  handle: string | null;
  /** Their microphone, as last reported by them. */
  muted: boolean;
  /** The host — for `adhoc` the starter, for an open room whoever opened it. */
  host: boolean;
  /**
   * Epoch ms when they actually entered the room.
   *
   * **`null` means invited-and-ringing**: on the roster, not yet in the call.
   * That is how the ad-hoc UI knows to show "Ringing…" next to a name without
   * needing a parallel status enum, and it is why an open room never has a null
   * here — nobody is ever rung into one.
   */
  joinedAt: number | null;
}

/* -------------------------------------------------------------------------- */
/* Client → server payloads                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Open a room.
 *
 * For `community`/`party` this is **create-or-join**: if a live room already
 * exists for that origin the server puts you in it rather than opening a second,
 * because two voice rooms for one community is a bug the UI cannot represent.
 * The reply is {@link GroupCallJoinedPayload} either way.
 */
export interface GroupCallStartPayload {
  origin: GroupCallOrigin;
  /** Community id or party id. Required for an open room, absent for `adhoc`. */
  originId?: string;
  /** The DM thread this started from, when it did. `adhoc` only. */
  conversationId?: string;
  /**
   * Who to ring. `adhoc` only and ignored otherwise — nobody is rung into an
   * open room. Capped at {@link MAX_GROUP_CALL_INVITES}; the server truncates
   * rather than refusing the whole call.
   */
  inviteeIds?: string[];
}

/**
 * Ring more people into a running room.
 *
 * Legal for an open room too, where it is a courtesy ping rather than an
 * admission grant: the invitee still has to pass the room's own membership rule
 * when they act on it. Invitees who fail the privacy/block check are dropped
 * silently — see {@link GroupCallRosterPayload}.
 */
export interface GroupCallInvitePayload {
  callId: string;
  userIds: string[];
}

/**
 * Enter a room.
 *
 * Always by `callId`, whether that came from a ring ({@link GroupCallIncomingPayload}),
 * from {@link GroupCallActivePayload}, or from a deep link. Deliberately *not*
 * addressable by `{ origin, originId }` — that is `START`'s job, and one
 * operation with two addressing modes is how a client and a server end up
 * disagreeing about whether a room was created.
 */
export interface GroupCallJoinPayload {
  callId: string;
}

export interface GroupCallDeclinePayload {
  callId: string;
}

export interface GroupCallLeavePayload {
  callId: string;
}

/** Host only. Everyone else gets {@link GCALL_S2C.ENDED} with `host-ended`. */
export interface GroupCallEndPayload {
  callId: string;
}

/** SDP for exactly one peer. */
export interface GroupCallSignalPayload {
  callId: string;
  /** The peer's **userId**. Required: there is no implicit other side. */
  to: string;
  /** An `RTCSessionDescriptionInit`, passed through opaquely. */
  description: { type: 'offer' | 'answer'; sdp: string };
}

/** One ICE candidate for exactly one peer. */
export interface GroupCallIcePayload {
  callId: string;
  /** The peer's **userId**. */
  to: string;
  /** An `RTCIceCandidateInit`, passed through opaquely. */
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

/**
 * Our own state, broadcast to the room.
 *
 * One event rather than a `mute` event, because the set of things a participant
 * publishes about themselves will grow (hand raised, deafened) and adding a
 * field is cheaper than adding an event and a rate-limit rule.
 */
export interface GroupCallStatePayload {
  callId: string;
  muted: boolean;
}

/** Is there a live open room here? Answered with {@link GroupCallActivePayload}. */
export interface GroupCallLookupPayload {
  origin: OpenRoomOrigin;
  originId: string;
}

/* -------------------------------------------------------------------------- */
/* Server → client payloads                                                   */
/* -------------------------------------------------------------------------- */

/**
 * You are being rung. `adhoc` only.
 *
 * Carries the roster so the card can say "Ana, Ben and 2 others" before you
 * answer, which is the difference between a group ring and a 1:1 one.
 */
export interface GroupCallIncomingPayload {
  callId: string;
  origin: GroupCallOrigin;
  originId: string | null;
  conversationId: string | null;
  /** Who started it. */
  from: CallPeer;
  /** Everyone already in, plus anyone else still ringing. */
  participants: GroupCallParticipantView[];
  /** Epoch ms at which the server gives up ringing. Mirrors {@link GROUP_RING_TIMEOUT_MS}. */
  expiresAt: number;
}

/**
 * Authoritative roster.
 *
 * A full snapshot, not a delta: the incremental events exist to keep the common
 * case cheap, and this exists so a client that missed one — reconnected, woke
 * from a background tab — can be made right without leaving the call.
 *
 * Note what is *not* here: invitees the server refused to ring. A person whose
 * privacy setting or block kept them out never appears, exactly as in the 1:1
 * flow, so the host cannot infer a block from a missing name any more than they
 * could from a missed call.
 */
export interface GroupCallRosterPayload {
  callId: string;
  participants: GroupCallParticipantView[];
}

/** You are in. Sent to the joining socket only. */
export interface GroupCallJoinedPayload {
  callId: string;
  origin: GroupCallOrigin;
  originId: string | null;
  conversationId: string | null;
  /** Our own userId, echoed so the mesh's offer rule has both sides of its compare. */
  selfId: string;
  hostId: string;
  participants: GroupCallParticipantView[];
  /** Epoch ms the room opened, for the shared call timer. */
  startedAt: number;
}

/**
 * Someone appeared on the roster.
 *
 * Fires both for a join and, in an ad-hoc call, for a mid-call invite that has
 * started ringing — `participant.joinedAt === null` tells the two apart. Only
 * a non-null `joinedAt` means there is a peer connection to build.
 */
export interface GroupCallPeerJoinedPayload {
  callId: string;
  participant: GroupCallParticipantView;
}

export interface GroupCallPeerLeftPayload {
  callId: string;
  userId: string;
  reason: GroupCallLeaveReason;
}

/** SDP from one named peer. */
export interface GroupCallSignalRelayPayload {
  callId: string;
  /** The sender's **userId**. Server-stamped — never taken from the sender. */
  from: string;
  description: { type: 'offer' | 'answer'; sdp: string };
}

/** One ICE candidate from one named peer. */
export interface GroupCallIceRelayPayload {
  callId: string;
  /** The sender's **userId**. Server-stamped. */
  from: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

/** A participant's published state changed. */
export interface GroupCallStateRelayPayload {
  callId: string;
  userId: string;
  muted: boolean;
}

export interface GroupCallEndedPayload {
  callId: string;
  reason: GroupCallEndReason;
  /** Room lifetime in whole seconds. Present once the room had actually opened. */
  durationSec?: number;
}

/**
 * Your request did not go through.
 *
 * `callId` is present when we were refused entry to a specific room and absent
 * when a `START` was refused before a room existed — which is why the client's
 * pre-join state has to exist without one (see `lib/groupcall/state.ts`).
 */
export interface GroupCallRejectedPayload {
  reason: GroupCallRejectReason;
  callId?: string;
  origin?: GroupCallOrigin;
  originId?: string | null;
}

/**
 * Open-room presence.
 *
 * The reply to `LOOKUP`, and pushed unprompted to a community/party room when
 * its voice room opens or closes so the "Join voice · 3" pill is live without
 * polling. `callId === null` means there is no room right now.
 */
export interface GroupCallActivePayload {
  origin: OpenRoomOrigin;
  originId: string;
  callId: string | null;
  participantCount: number;
  /**
   * Who is in, for the stacked avatars on the pill. Trimmed by the server; not
   * a substitute for {@link GroupCallRosterPayload} once you are in the room.
   */
  participants: GroupCallParticipantView[];
}

export interface GroupCallErrorPayload {
  code: GroupCallErrorCode;
  /** Untranslated English, for the console and for a developer-facing toast. */
  message: string;
  callId?: string;
}

/* -------------------------------------------------------------------------- */
/* Caps                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Hard ceiling on a room.
 *
 * Server-enforced, for the mesh-cost reasons argued at the top of this file. It
 * is not a soft target: a ninth join is refused with `full`, because the person
 * it would degrade is not the one making the request.
 */
export const MAX_GROUP_CALL_PARTICIPANTS = 8;

/**
 * Ceiling on `inviteeIds` in a single `START`.
 *
 * The host is already in the room, so the most invitees that could ever fit is
 * the cap minus one. Derived rather than written as `7` so the two cannot drift.
 */
export const MAX_GROUP_CALL_INVITES = MAX_GROUP_CALL_PARTICIPANTS - 1;

/**
 * How long an ad-hoc room rings before the un-answered invitees are dropped.
 *
 * Server-authoritative: the client shows a matching countdown from
 * `expiresAt`, but the server is what actually gives up, so a client that
 * ignores the timer cannot ring a room full of people indefinitely.
 *
 * Declared here rather than aliasing `RING_TIMEOUT_MS` even though it currently
 * holds the same 45 s. The size caps above are a physical fact shared with the
 * 1:1 feature; this is a product judgement about how long a phone should buzz,
 * and the two features are allowed to answer it differently without one of them
 * changing under the other.
 */
export const GROUP_RING_TIMEOUT_MS = 45_000;

/**
 * Re-exported so a validator can reach every cap from one import. `satisfies`
 * keeps the literal types while asserting the shape.
 */
export const GROUP_CALL_LIMITS = {
  maxParticipants: MAX_GROUP_CALL_PARTICIPANTS,
  maxInvites: MAX_GROUP_CALL_INVITES,
  ringTimeoutMs: GROUP_RING_TIMEOUT_MS,
  maxSdpBytes: MAX_SDP_BYTES,
  maxIceBytes: MAX_ICE_BYTES,
} satisfies Record<string, number>;
