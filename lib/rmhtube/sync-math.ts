/**
 * RmhTube — the room timeline (pure; shared by client and server).
 *
 * The canonical `VideoState` is an *anchor*: a position that was true at an
 * instant on the server clock. To know where the room is **now** you project
 * that anchor forward by the elapsed wall-clock time. Keeping the projection
 * here and pure means the server (which advances the timeline so the room does
 * not freeze when the leader's tab is throttled) and every client (which
 * compares the projection against its own player) cannot disagree about it.
 *
 * Two facts on the anchor exist because ignoring them is what desynchronised
 * the room in practice:
 *
 * **`stalled`** — the leader is buffering. Its reported position stops moving,
 * but wall-clock time does not, so unconditional projection ran the room ahead
 * of the person it was following. Every viewer chased a position the leader had
 * not reached, and the leader's next report yanked them all back. Holding the
 * timeline while the leader stalls is what turns that oscillation into a pause.
 *
 * **`mode`** — a livestream has no fixed timeline to project. `currentTime`
 * against a sliding DVR window means something different on every machine, so
 * `live` states are never projected and never seeked; live viewers are held at
 * the edge the provider gives them.
 */

import type { VideoState } from './types';

/** The parts of a `VideoState` the projection actually reads. */
type Projectable = Pick<
  VideoState,
  'mode' | 'playing' | 'currentTime' | 'playbackRate' | 'updatedAt' | 'stalled'
>;

/**
 * Effective playhead position (seconds) at `serverNow` (server-clock ms).
 *
 * Held — not advanced — when paused, when the leader is stalled, or when the
 * source is live. In all three cases wall-clock time is not evidence that the
 * media moved.
 */
export function extrapolate(vs: Projectable, serverNow: number): number {
  if (!vs.playing || vs.stalled || vs.mode === 'live') return vs.currentTime;
  const elapsedMs = Math.max(0, serverNow - vs.updatedAt);
  return vs.currentTime + (elapsedMs / 1000) * (vs.playbackRate || 1);
}

/**
 * Re-anchor a state to `serverNow`: position advanced to its effective value,
 * `updatedAt` re-stamped. This is what the server broadcasts, so every client
 * receives a fresh self-consistent anchor however stale the leader's last
 * report was.
 */
export function reanchor(vs: VideoState, serverNow: number): VideoState {
  return {
    ...vs,
    currentTime: extrapolate(vs, serverNow),
    updatedAt: serverNow,
  };
}

/** A paused state at the origin — the state a fresh media item starts in. */
export function initialVideoState(serverNow: number, mode: VideoState['mode'] = 'vod'): VideoState {
  return {
    mode,
    playing: false,
    currentTime: 0,
    playbackRate: 1,
    updatedAt: serverNow,
    stalled: false,
    rev: 0,
  };
}

/**
 * Is `next` newer than `current`?
 *
 * Socket.io preserves order per connection, but an anchor can also arrive from
 * a targeted resync reply while a heartbeat is in flight, and a client applies
 * optimistic local edges of its own. `rev` is the tiebreak; `updatedAt` settles
 * the case where both carry the same revision.
 */
export function isNewerAnchor(current: VideoState | null | undefined, next: VideoState): boolean {
  if (!current) return true;
  if (next.rev !== current.rev) return next.rev > current.rev;
  return next.updatedAt >= current.updatedAt;
}
