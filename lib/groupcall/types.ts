/**
 * Group voice calls — client-safe view types.
 *
 * These are the shapes the store and the UI need that are **not** wire
 * payloads. The split matters: `lib/groupcall/events.ts` is the contract the
 * server also compiles against and may not contain a single field the server
 * cannot produce, whereas everything here is knowledge the browser has about
 * itself — the state of its own `RTCPeerConnection`s, whether the microphone
 * prompt was refused, who is currently making noise. None of it crosses the
 * wire and none of it is authoritative.
 *
 * Plain module (no `.server`, no `node:*`, no Prisma), same as
 * `lib/spaces/types.ts` and `lib/party/types.ts`.
 */

import type {
  GroupCallOrigin,
  GroupCallParticipantView,
  OpenRoomOrigin,
} from '@/lib/groupcall/events';

/**
 * What a room is scoped to.
 *
 * One value carried around together everywhere, because `origin` alone is
 * ambiguous (`community` without an id names nothing) and an id alone does not
 * say which table to look it up in. `originId` is `null` exactly when `origin`
 * is `'adhoc'`.
 */
export interface GroupCallOriginRef {
  origin: GroupCallOrigin;
  originId: string | null;
}

/** The same, narrowed to the two origins that produce an open room. */
export interface OpenRoomRef {
  origin: OpenRoomOrigin;
  originId: string;
}

/**
 * The state of one leg of the mesh, as this browser sees it.
 *
 * Deliberately *not* `RTCPeerConnectionState`: that enum's `disconnected` is
 * routinely transient on mobile networks and recovers on its own, so surfacing
 * it verbatim makes the UI flicker "lost Ana" every time someone walks past a
 * lift. `reconnecting` is our name for "dropped but still worth waiting for",
 * matching the vocabulary `RealtimeStatus` already uses elsewhere in the app.
 */
export type GroupCallPeerStatus =
  /** Created, nothing negotiated yet. */
  | 'new'
  /** Offer/answer in flight, or ICE still gathering. */
  | 'connecting'
  /** Audio is flowing. */
  | 'connected'
  /** Was connected, dropped, retrying. Keep the tile on screen. */
  | 'reconnecting'
  /** Terminal for this leg. Everyone else in the room is unaffected. */
  | 'failed'
  /** Torn down deliberately — they left, or we did. */
  | 'closed';

/** True while this leg is worth keeping on screen rather than removing. */
export function isPeerLive(status: GroupCallPeerStatus): boolean {
  return (
    status === 'new' ||
    status === 'connecting' ||
    status === 'connected' ||
    status === 'reconnecting'
  );
}

/**
 * One remote participant, as rendered.
 *
 * The roster half comes from the server ({@link GroupCallParticipantView}); the
 * rest is local. Both live on one object because the UI renders one tile per
 * person and splitting them across two maps means every render joins them.
 */
export interface GroupCallPeerView {
  participant: GroupCallParticipantView;
  status: GroupCallPeerStatus;
  /** True while this browser has decided they are talking. Purely local. */
  speaking: boolean;
  /**
   * Smoothed output level, 0–1, for the ring around the avatar.
   *
   * Local and approximate: it is measured from the audio we receive, so it says
   * "how loud they are here", which is also the only thing the ring can honestly
   * claim.
   */
  level: number;
  /** Did we make the offer to them? Decided by {@link shouldOffer}, kept for debugging a stuck leg. */
  offerer: boolean;
  /** Epoch ms of the last state change, so a stuck `connecting` can be timed out. */
  changedAt: number;
}

/**
 * Everything this browser knows about its own microphone.
 *
 * `muted` is duplicated in `GroupCallState` (where it is the value published to
 * the room) — here it is the value actually applied to the audio tracks. They
 * agree in the steady state; the two exist because the publish can fail and the
 * track must still be silent.
 */
export interface GroupCallSelfView {
  /** The mute actually applied to the local tracks. */
  muted: boolean;
  /** `getUserMedia` was refused. Shows the permission hint instead of a mic button. */
  micDenied: boolean;
  /** No microphone hardware, or the browser cannot do WebRTC at all. */
  micAvailable: boolean;
  speaking: boolean;
  level: number;
}

/** A room that has not been joined, as shown on a "Join voice" pill. */
export interface GroupCallRoomSummary {
  callId: string;
  origin: OpenRoomOrigin;
  originId: string;
  participantCount: number;
  /** Trimmed, for stacked avatars. Not the full roster. */
  participants: GroupCallParticipantView[];
  /** True once the room is at {@link MAX_GROUP_CALL_PARTICIPANTS}. */
  full: boolean;
}

/**
 * Speech detection thresholds, shared so every surface agrees on what "talking"
 * means.
 *
 * A single RMS threshold flickers badly on speech, which is full of gaps — so
 * the rule is asymmetric: cross {@link SPEAKING_RMS_THRESHOLD} to start, and
 * stay quiet for {@link SPEAKING_RELEASE_MS} to stop. That is the same shape as
 * a noise gate's attack/release and it is why a highlighted speaker does not
 * strobe between syllables.
 */
export const SPEAKING_RMS_THRESHOLD = 0.045;
export const SPEAKING_RELEASE_MS = 320;

/**
 * How often the level meters are sampled, in ms.
 *
 * Twelve times a second: fast enough that the ring tracks speech, slow enough
 * that eight of them together are not a per-frame job. Nothing here writes a
 * custom property per frame (repo design rule) — the meter is a transform on a
 * throttled interval.
 */
export const LEVEL_SAMPLE_MS = 80;
