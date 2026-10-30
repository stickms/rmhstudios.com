/**
 * Referee checkpoints (REF-19, §0.3): serialise, validate, restore.
 *
 * The checkpoint is the referee's whole persistent state (`RefState.cp`),
 * versioned (`v:1`), sequenced (`seq`, monotonic per run) and tagged with
 * the `runId`, so a previous match's checkpoint is never adopted.
 */

import type { Id, RefCheckpoint, StartedMatch } from '../types';
import { parseRefCheckpoint } from '../wire-codec';
import { refFromCheckpoint, type RefState } from './referee';

export { refFromCheckpoint, refRebuild, parseCheckpoint, refCreate } from './referee';
export type { RebuildInfo } from './referee';

export function serializeCheckpoint(cp: RefCheckpoint): string {
  return JSON.stringify(cp);
}

/** Parse + validate a serialised checkpoint; null on any error. */
export function deserializeCheckpoint(text: string): RefCheckpoint | null {
  try {
    return parseRefCheckpoint(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Is `cp` usable for this match (same run, newer than what we hold)? */
export function checkpointUsable(
  cp: RefCheckpoint | null,
  match: StartedMatch,
  minSeq = 0,
): cp is RefCheckpoint {
  return !!cp && cp.runId === match.runId && cp.seq >= minSeq;
}

/** The newer of two checkpoints for the same run (by `seq`). */
export function newerCheckpoint(
  a: RefCheckpoint | null,
  b: RefCheckpoint | null,
): RefCheckpoint | null {
  if (!a) return b;
  if (!b) return a;
  if (a.runId !== b.runId) return b;
  return b.seq > a.seq ? b : a;
}

/** Round trip a state through its serialised checkpoint (what a takeover does). */
export function roundTripState(state: RefState, present: readonly Id[]): RefState {
  const cp = deserializeCheckpoint(serializeCheckpoint(state.cp));
  if (!cp) throw new Error('checkpoint failed validation');
  return refFromCheckpoint(state.match, cp, present);
}
