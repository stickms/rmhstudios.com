// =============================================================================
// ALTAIR VERIFY -- The job a finished co-op match becomes
// =============================================================================
// Built by the hub (everything under `trusted` comes from the hub's own state; only `log` and
// `claim` come from the host's browser) and consumed by the verify worker. Plain types/consts so
// the hub, the web route and the worker can share them.
// =============================================================================

import type { ClaimedCoopResult } from './verify-coop';

export const VERIFY_COOP_QUEUE =
  'altair.verify-coop';

/** Most verification jobs allowed to wait; beyond this new runs are dropped (not recorded). */
export const MAX_VERIFY_BACKLOG = 40;
/** One host may have at most this many runs submitted per hour (one lobby cannot flood the worker). */
export const MAX_RUNS_PER_HOST_PER_HOUR = 8;

export interface JobPlayer {
  userId: string;
  userName: string;
  classId: string;
  slot: number;
}

export interface CoopRunJob {
  /** Hub-issued, unique per started run. The dedupe key. */
  runId: string;
  lobbyId: string;
  hostUserId: string;
  /** Hub-issued random seed. */
  seed: number;
  doubleTime: boolean;
  /** Players present when the run started. */
  roster: JobPlayer[];
  /** Players the hub admitted mid-run. */
  joins: JobPlayer[];
  /** Hub-measured wall-clock milliseconds from start to the host's end report. */
  wallMs: number;
  /** UNTRUSTED: the host's run log (checked by checkRunLog). */
  log: unknown;
  /** UNTRUSTED: the result the host says it got (must equal the replay). */
  claim: ClaimedCoopResult;
}
