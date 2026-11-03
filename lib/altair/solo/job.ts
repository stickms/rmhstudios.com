// =============================================================================
// ALTAIR SOLO -- the job a finished single-player run becomes
// =============================================================================
// Everything TRUSTED (seed, class, loadout, double time) is read by the worker from the AltairSoloRun
// row the server issued; the job itself carries only the run id, the server-measured wall clock, and
// the browser's UNTRUSTED log and claim.

import type { ClaimedSoloResult } from './verify-solo';

export const VERIFY_SOLO_QUEUE = 'altair.verify-solo';

/** Most solo verification jobs allowed to wait; beyond this a run is paid through the capped fallback. */
export const MAX_SOLO_BACKLOG = 60;
/** At most this many solo submissions per user per hour (a run needs its own issued seed anyway). */
export const MAX_SOLO_SUBMISSIONS_PER_HOUR = 30;
/** A run id is valid this long after issue (pauses count: it is wall clock). */
export const SOLO_RUN_TTL_MS = 3 * 3_600_000;

export interface SoloRunJob {
  runId: string;
  userId: string;
  /** Server-measured milliseconds between issuing the run and receiving its log. */
  wallMs: number;
  /** UNTRUSTED: the browser's run log (checked by checkSoloLog). */
  log: unknown;
  /** UNTRUSTED: the result the browser says it got (must equal the replay). */
  claim: ClaimedSoloResult;
}
