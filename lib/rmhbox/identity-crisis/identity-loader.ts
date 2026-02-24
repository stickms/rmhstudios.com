/**
 * Identity Crisis — Identity Data Loader
 *
 * Loads and caches the identity pool from the static JSON data file.
 * Provides selection logic for choosing identities for a game,
 * with difficulty escalation and category diversity.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §1.3.2
 */

import { IdentitySchema, type Identity } from './schemas';
import { logger } from '../../../server/rmhbox/logger';
import * as fs from 'fs';
import * as path from 'path';

// ─── Module-level cache (singleton) ──────────────────────────────

let cachedIdentities: Identity[] | null = null;

/**
 * Load and validate identities from the static JSON file.
 * Returns a cached reference on repeated calls.
 */
export function loadIdentities(): Identity[] {
  if (cachedIdentities) return cachedIdentities;

  const filePath = path.join(process.cwd(), 'public', 'data', 'rmhbox', 'identity-crisis', 'identities.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = JSON.parse(raw) as unknown[];

  const valid: Identity[] = [];
  for (const entry of entries) {
    const result = IdentitySchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logger.warn({ event: 'identity_load_skip', entry, errors: result.error.issues });
    }
  }

  cachedIdentities = valid;
  logger.info({ event: 'identities_loaded', count: valid.length });
  return valid;
}

/**
 * Reset the identity cache (for testing purposes).
 */
export function resetIdentityCache(): void {
  cachedIdentities = null;
}

/**
 * Select identities for a game with difficulty escalation and category diversity.
 *
 * @param pool - Full identity pool to select from
 * @param playerCount - Number of players (= number of identities needed)
 * @param usedIds - IDs already used in this session (prevents repeats)
 * @param sessionRound - Current session round number (0-indexed, for difficulty escalation)
 * @returns Array of `playerCount` unique identities, shuffled
 */
export function selectIdentitiesForGame(
  pool: Identity[],
  playerCount: number,
  usedIds: Set<string>,
  sessionRound: number,
): Identity[] {
  // Filter out already-used identities
  let available = pool.filter((id) => !usedIds.has(id.id));

  // Difficulty escalation filter
  if (sessionRound === 0) {
    // First game: prefer easy
    const easy = available.filter((id) => id.difficulty === 'easy');
    if (easy.length >= playerCount) available = easy;
  } else if (sessionRound >= 1 && sessionRound < 3) {
    // Mix easy/medium
    const easyMedium = available.filter((id) => id.difficulty !== 'hard');
    if (easyMedium.length >= playerCount) available = easyMedium;
  }
  // sessionRound >= 3: all difficulties allowed (including hard)

  // Category diversity: group by category and round-robin pick
  const byCategory = new Map<string, Identity[]>();
  for (const identity of available) {
    const group = byCategory.get(identity.category) ?? [];
    group.push(identity);
    byCategory.set(identity.category, group);
  }

  // Shuffle each category group
  for (const group of byCategory.values()) {
    shuffleArray(group);
  }

  // Round-robin pick across categories
  const selected: Identity[] = [];
  const categoryKeys = shuffleArray([...byCategory.keys()]);
  let categoryIndex = 0;

  while (selected.length < playerCount && categoryKeys.length > 0) {
    const catKey = categoryKeys[categoryIndex % categoryKeys.length];
    const group = byCategory.get(catKey)!;

    if (group.length > 0) {
      selected.push(group.shift()!);
    } else {
      // This category is exhausted, remove it
      categoryKeys.splice(categoryIndex % categoryKeys.length, 1);
      if (categoryKeys.length === 0) break;
      continue;
    }
    categoryIndex++;
  }

  // If we still need more (unlikely with 80+ identities), fill from remaining
  if (selected.length < playerCount) {
    const selectedIds = new Set(selected.map((s) => s.id));
    const remaining = available.filter((id) => !selectedIds.has(id.id));
    shuffleArray(remaining);
    while (selected.length < playerCount && remaining.length > 0) {
      selected.push(remaining.shift()!);
    }
  }

  // Final shuffle so assignment order is random
  shuffleArray(selected);

  return selected;
}

/** Fisher-Yates shuffle (in-place, returns the array for chaining). */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
