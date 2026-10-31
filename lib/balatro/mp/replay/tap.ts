/**
 * The seam between the session runtime's roles (WS5: lobby-host.ts,
 * lobby-member.ts) and the replay/spectate feature (WS13). The runtime holds
 * one `ReplayTap` (set by replay/attach.ts) and the roles call it; without it
 * they behave exactly as before. Types only (no runtime code), so the roles
 * import nothing of WS13's.
 */

import type { Id, ReplayEvent, StartedMatch } from '../types';

export interface LogBatch {
  runId: string;
  batch: ReplayEvent[];
}

export interface ReplayTap {
  /** A player's `log` batch arrived over P2P (the host stamped `from`; the host's own has no `f`). */
  peerLog(from: Id, d: LogBatch): void;
  /**
   * Host: a spectator joined match `runId` mid-way — send it every log held so
   * far, as `log` frames from each player (`send` returns false when the link
   * refused the frame). Paced to stay inside the receiver's `log` rate limit.
   */
  catchUp(runId: string, send: (from: Id, d: LogBatch) => boolean): void;
  /** Spectator: the match being watched (from `welcome` or `start_game`). */
  spectate(match: StartedMatch): void;
}
