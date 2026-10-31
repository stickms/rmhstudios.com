/**
 * Manhunt (REF-06, A1 §4.1, §4.3).
 *
 * - Reset: exactly one Runner — the first roster entry that claims RUNNER,
 *   else the first player; extra claimants are demoted to Hunter.
 * - Round: a Hunter loses a life if its score is below the Runner's, or
 *   equal while the Runner scored more than 0. The Runner is caught iff the
 *   best Hunter score is strictly above the Runner's.
 */

import type { Id, RosterEntry, Team } from '../types';
import type { Scored } from './royale';

/** Roles for every roster entry (Runner first claimant, else the first player). */
export function assignManhuntRoles(roster: readonly RosterEntry[]): Record<Id, Team> {
  const out: Record<Id, Team> = {};
  const runner = roster.find((r) => r.team === 'RUNNER') ?? roster[0];
  for (const r of roster) out[r.id] = r.id === runner?.id ? 'RUNNER' : 'HUNTER';
  return out;
}

export interface ManhuntRound {
  hunterLosers: Id[];
  runnerCaught: boolean;
}

export function manhuntRound(runner: Scored, hunters: readonly Scored[]): ManhuntRound {
  const hunterLosers = hunters
    .filter((h) => h.score < runner.score || (h.score === runner.score && runner.score > 0))
    .map((h) => h.id);
  const best = hunters.reduce((m, h) => (h.score > m ? h.score : m), -Infinity);
  return { hunterLosers, runnerCaught: hunters.length > 0 && best > runner.score };
}

/** The Runner's HUD target: the top-scoring Hunter (first in roster order on a tie). */
export function manhuntTarget(hunters: readonly Scored[]): Id | '' {
  let best: Scored | null = null;
  for (const h of hunters) if (!best || h.score > best.score) best = h;
  return best ? best.id : '';
}
