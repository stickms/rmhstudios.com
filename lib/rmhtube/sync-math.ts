/**
 * RmhTube — Sync Math (pure helpers shared by client & server)
 *
 * The canonical `videoState` stores a position (`currentTime`) captured at an
 * instant (`updatedAt`, in server-clock ms). To know where the playhead *is
 * now* we extrapolate forward by the elapsed wall-clock time while playing.
 *
 * Keeping this pure and shared means the server (which advances the timeline so
 * the room doesn't freeze when the leader's tab is throttled) and the client
 * (which compares against its own player) use identical math.
 */

import type { VideoState } from './types';

/**
 * Effective playhead position (seconds) at `serverNow` (server-clock ms).
 * When paused, the stored position is authoritative as-is.
 */
export function extrapolate(vs: Pick<VideoState, 'playing' | 'currentTime' | 'playbackRate' | 'updatedAt'>, serverNow: number): number {
  if (!vs.playing) return vs.currentTime;
  const elapsedMs = Math.max(0, serverNow - vs.updatedAt);
  return vs.currentTime + (elapsedMs / 1000) * (vs.playbackRate || 1);
}

/**
 * Re-anchor a VideoState to `serverNow`: position advanced to the effective
 * value and `updatedAt` re-stamped. This is what the server broadcasts so every
 * client receives a fresh, self-consistent anchor regardless of how stale the
 * leader's last report was.
 */
export function reanchor(vs: VideoState, serverNow: number): VideoState {
  return {
    ...vs,
    currentTime: extrapolate(vs, serverNow),
    updatedAt: serverNow,
  };
}
