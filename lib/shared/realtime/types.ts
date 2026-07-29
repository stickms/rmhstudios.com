/**
 * The realtime status contract, shared by every socket-backed app and game.
 *
 * Deliberately six states, not four. The apps used to collapse "we lost the
 * connection and are fighting to get it back" into the same `connecting` they
 * showed on first load, so a mid-game drop looked identical to a cold start
 * and the UI had no way to say "your game is still here, hold on".
 */
export type RealtimeStatus =
  /** No connection has been attempted yet. */
  | 'idle'
  /** First connection attempt in flight. */
  | 'connecting'
  /** Live. */
  | 'connected'
  /** Was connected, dropped, and is retrying. Session state is still valid. */
  | 'reconnecting'
  /** Deliberately closed — by us, or by the server telling us to go away. */
  | 'disconnected'
  /** Terminal: bad credentials, or retries exhausted. Needs user action. */
  | 'error';

/** True while the app should treat its cached session state as still valid. */
export function isRecoverable(status: RealtimeStatus): boolean {
  return status === 'connecting' || status === 'reconnecting' || status === 'connected';
}

/** True while the app cannot send anything to the server. */
export function isOffline(status: RealtimeStatus): boolean {
  return status !== 'connected';
}

/**
 * How long a peer may be gone before the room stops waiting for them.
 *
 * Long enough to survive a tunnel, a wifi/cellular handover or a screen lock;
 * short enough that four people aren't held hostage by someone who closed
 * their laptop. The server owns the authoritative timer — this constant is
 * shared so the client's countdown agrees with it.
 */
export const PEER_GRACE_MS = 15_000;

/** Payload for the pause banner shown while a peer is in their grace window. */
export interface PeerWaitState {
  /** Users the room is currently waiting on. */
  peers: { userId: string; userName: string }[];
  /** Epoch ms at which the earliest grace window expires. */
  kickAt: number;
}
