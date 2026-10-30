/**
 * How much playtime one heartbeat is worth, and when a client should send one.
 *
 * The client sends a beat about every 30 s; the server decides the credit, so a
 * script gains at most one real-time clock per user: beats closer than
 * `HEARTBEAT_MIN_GAP_S` earn nothing, and a long silence (a closed tab, a
 * sleeping laptop) is capped at `HEARTBEAT_MAX_CREDIT_S`.
 *
 * Pure and client-safe — the Tracker imports `shouldBeat`, the server imports
 * `creditSeconds`.
 */

export const HEARTBEAT_INTERVAL_S = 30;
export const HEARTBEAT_MIN_GAP_S = 20;
export const HEARTBEAT_MAX_CREDIT_S = 60;
/** A user who has not touched the page for longer than this is not "playing". */
export const IDLE_LIMIT_MS = 5 * 60_000;

/** Seconds to credit for a beat arriving at `now`, given the last accepted beat. */
export function creditSeconds(lastHeartbeatAt: Date | null, now: Date): number {
  if (!lastHeartbeatAt) return HEARTBEAT_INTERVAL_S;
  const gap = (now.getTime() - lastHeartbeatAt.getTime()) / 1000;
  if (gap < HEARTBEAT_MIN_GAP_S) return 0;
  return Math.min(Math.floor(gap), HEARTBEAT_MAX_CREDIT_S);
}

/** Whether a client should send a beat right now. */
export function shouldBeat(s: {
  visible: boolean;
  signedIn: boolean;
  lastInputAt: number;
  now: number;
}): boolean {
  return s.signedIn && s.visible && s.now - s.lastInputAt <= IDLE_LIMIT_MS;
}
