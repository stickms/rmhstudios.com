/**
 * Pixel Pushers — Level Loader
 *
 * Loads and validates level definitions from levels.json.
 * Cached as a singleton after first load. Also provides
 * selectLevelsForGame() for difficulty-escalating level selection.
 *
 * Reference: docs/rmhbox/implementation/phase-8.md §8.3.5
 */

import { PPLevelSchema, type PPLevel } from './schemas';
import levelsData from '../../../public/data/rmhbox/pixel-pushers/levels.json';

let cachedLevels: PPLevel[] | null = null;

/**
 * Load and validate all levels from the embedded JSON data.
 * Returns the cached array on repeated calls (singleton pattern).
 */
export function loadLevels(): PPLevel[] {
  if (cachedLevels) return cachedLevels;

  const validated: PPLevel[] = [];
  for (const entry of levelsData as unknown[]) {
    const result = PPLevelSchema.safeParse(entry);
    if (result.success) {
      validated.push(result.data);
    } else {
      console.warn('[pixel-pushers] Skipping invalid level entry:', result.error.issues);
    }
  }

  cachedLevels = validated;
  return cachedLevels;
}

/**
 * Select levels for a game with escalating difficulty.
 * Returns [easy, medium, hard] in order, excluding used IDs.
 * Shuffles within each difficulty bucket before selection.
 */
export function selectLevelsForGame(
  pool: PPLevel[],
  levelCount: number,
  usedIds: Set<string>,
): PPLevel[] {
  const available = pool.filter((l) => !usedIds.has(l.id));

  const byDifficulty: Record<string, PPLevel[]> = { easy: [], medium: [], hard: [] };
  for (const level of available) {
    byDifficulty[level.difficulty]?.push(level);
  }

  // Shuffle each bucket
  for (const bucket of Object.values(byDifficulty)) {
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
  }

  // Select with difficulty escalation: easy first, then medium, then hard
  const difficultyOrder = ['easy', 'medium', 'hard'];
  const selected: PPLevel[] = [];

  for (let i = 0; i < levelCount; i++) {
    const difficulty = difficultyOrder[Math.min(i, difficultyOrder.length - 1)];
    const bucket = byDifficulty[difficulty];
    if (bucket && bucket.length > 0) {
      selected.push(bucket.shift()!);
    } else {
      // Fallback: pick from any remaining bucket
      for (const d of difficultyOrder) {
        if (byDifficulty[d] && byDifficulty[d].length > 0) {
          selected.push(byDifficulty[d].shift()!);
          break;
        }
      }
    }
  }

  return selected;
}
