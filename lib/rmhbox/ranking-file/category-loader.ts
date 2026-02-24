/**
 * Ranking File — Category Data Loader
 *
 * Loads and caches the ranking category pool from the static JSON data file.
 * Provides selection logic for choosing categories for a game.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §2.3.2
 */

import { RankingCategorySchema, type RankingCategory } from './schemas';
import { logger } from '../../../server/rmhbox/logger';
import * as fs from 'fs';
import * as path from 'path';

// ─── Module-level cache (singleton) ──────────────────────────────

let cachedCategories: RankingCategory[] | null = null;

/**
 * Load and validate categories from the static JSON file.
 * Returns a cached reference on repeated calls.
 */
export function loadCategories(): RankingCategory[] {
  if (cachedCategories) return cachedCategories;

  const filePath = path.join(process.cwd(), 'public', 'data', 'rmhbox', 'ranking-file', 'categories.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = JSON.parse(raw) as unknown[];

  const valid: RankingCategory[] = [];
  for (const entry of entries) {
    const result = RankingCategorySchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logger.warn({ event: 'category_load_skip', entry, errors: result.error.issues });
    }
  }

  cachedCategories = valid;
  logger.info({ event: 'categories_loaded', count: valid.length });
  return valid;
}

/**
 * Reset the category cache (for testing purposes).
 */
export function resetCategoryCache(): void {
  cachedCategories = null;
}

/**
 * Select categories for a game without replacement.
 *
 * @param pool - Full category pool to select from
 * @param roundCount - Number of rounds (= number of categories needed)
 * @param usedIds - IDs already used in this session (prevents repeats)
 * @returns Array of `roundCount` unique categories, shuffled
 */
export function selectCategoriesForGame(
  pool: RankingCategory[],
  roundCount: number,
  usedIds: Set<string>,
): RankingCategory[] {
  // Filter out already-used categories
  const available = pool.filter((cat) => !usedIds.has(cat.id));

  // Shuffle for variety
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Select the required number
  return shuffled.slice(0, roundCount);
}
