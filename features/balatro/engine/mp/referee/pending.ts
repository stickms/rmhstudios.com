/**
 * Pending death (REF-10…REF-12, A1 §4.6).
 *
 * A player who loses their last life on a non-PvP blind (a failed Small/Big
 * or an ante-timer expiry) does not hand the win over at once: the others
 * must play the same blind (`"<ante>:<Small|Big|Boss>"`).
 *
 * "Has a result for that blind" is a recorded `blind_result` (a skip counts
 * as beaten; a failure is final). Two reconstructions keep a pending death
 * from stalling when the blind key is one the other side will never report
 * (D-06 — the timer key is the blind *on deck*, which may be the PvP Boss):
 * a player whose reported ante is past the key's ante, or who readies for
 * the PvP Boss of the key's ante, counts as having beaten it. Both are
 * applied by the referee through `resultOf`.
 */

import type { Id } from '../types';

export type BlindResult = 'B' | 'F';

/** The ante of a blind key (`"3:Small"` → 3); NaN-safe (→ 0). */
export function blindKeyAnte(key: string): number {
  const n = Number.parseInt(key.split(':')[0] ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

export function blindKeySlot(key: string): string {
  return key.split(':')[1] ?? '';
}

export type Decision = { kind: 'win'; winner: Id } | { kind: 'draw' } | { kind: 'pending' };

/** The 2-player decision table (REF-10). */
export function decide2pDeath(a: {
  dead: Id;
  opponent: Id;
  opponentResult: BlindResult | undefined;
  opponentLives: number;
  opponentPresent: boolean;
}): Decision {
  if (a.opponentResult === 'B') return { kind: 'win', winner: a.opponent };
  if (a.opponentLives <= 0) return { kind: 'draw' };
  if (a.opponentResult === 'F') return { kind: 'win', winner: a.opponent };
  if (!a.opponentPresent) return { kind: 'win', winner: a.dead };
  return { kind: 'pending' };
}

/** Team pending (REF-12): has the other side settled the blind? */
export function decideTeamPending(
  otherSide: readonly { result: BlindResult | undefined; lives: number; left: boolean }[],
): 'other_wins' | 'draw' | 'pending' {
  if (otherSide.some((p) => p.result === 'B')) return 'other_wins';
  if (otherSide.every((p) => p.result === 'F' || p.lives <= 0 || p.left)) return 'draw';
  return 'pending';
}
