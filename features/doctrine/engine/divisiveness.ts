/**
 * Doctrine Engine — Divisiveness Index
 *
 * Measures how polarizing content is. High DI = content is working.
 * Scale: 0 (consensus) to 100 (maximum polarization).
 */

import type { ReactionCount } from './types';
import { DI_MIN_REACTIONS } from './constants';

/**
 * Calculate the Divisiveness Index for a set of reactions.
 *
 * Components:
 * - Polarization (50%): How evenly split positive vs negative reactions are
 * - Chaos factor (30%): Proportion of "tung" (chaotic neutral) reactions
 * - Engagement (20%): Inverse of neutral/mid proportion
 */
export function calculateDivisiveness(reactions: ReactionCount): number {
  const total = reactions.fire + reactions.based + reactions.mid +
    reactions.cringe + reactions.trash + reactions.tung;

  if (total < DI_MIN_REACTIONS) return 0;

  const positive = reactions.fire + reactions.based;
  const negative = reactions.cringe + reactions.trash;
  const chaotic = reactions.tung;
  const neutral = reactions.mid;

  // Polarization = how evenly split are positive vs negative
  const polarization = 1 - Math.abs(positive - negative) / (positive + negative || 1);

  // Chaos factor = proportion of "tung" reactions (pure chaos)
  const chaosFactor = chaotic / total;

  // Engagement = inverse of neutral proportion (more neutrals = less divisive)
  const engagement = 1 - (neutral / total);

  // Weighted combination
  return Math.round((polarization * 0.5 + chaosFactor * 0.3 + engagement * 0.2) * 100);
}

/**
 * Aggregate reaction counts from an array of individual reactions.
 */
export function aggregateReactions(
  reactions: Array<{ reaction: string }>,
): ReactionCount {
  const counts: ReactionCount = {
    fire: 0,
    based: 0,
    mid: 0,
    cringe: 0,
    trash: 0,
    tung: 0,
  };

  for (const r of reactions) {
    const key = r.reaction.toLowerCase() as keyof ReactionCount;
    if (key in counts) counts[key]++;
  }

  return counts;
}
