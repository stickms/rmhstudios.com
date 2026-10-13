import { SCORE, comboMultiplier } from '@/lib/laundry-sort/constants';
import { SEEDED_GAMES, type SeededGameId } from '@/lib/arcade/seeded';

/**
 * Reachability check for a client-reported seeded run. Not a replay: it rejects
 * the impossible (a score beyond what the sorted count or the game ceiling
 * allows, or a run shorter than the game can last) and nothing more.
 */
export function plausibleRun(
  gameId: SeededGameId,
  score: number,
  elapsedMs: number,
  detail: Record<string, number> | undefined,
): boolean {
  const game = SEEDED_GAMES[gameId];
  if (!Number.isInteger(score) || score < 0 || score > game.maxScore) return false;
  if (elapsedMs < game.minDurationMs) return false;
  if (gameId === 'laundry-sort') {
    const sorted = detail?.sorted;
    if (typeof sorted !== 'number' || !Number.isInteger(sorted) || sorted < 0 || sorted > 10_000)
      return false;
    return score <= Math.round(sorted * SCORE.correct * comboMultiplier(SCORE.maxComboSteps));
  }
  return true;
}
