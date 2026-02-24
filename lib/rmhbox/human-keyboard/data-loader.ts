/**
 * RMHbox — Human Keyboard Data Loader
 *
 * Loads and caches the curated sentence pool from sentences.json.
 * Provides selection logic that scales sentence length with player count.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Types ───────────────────────────────────────────────────────

export interface TargetSentence {
  id: string;
  text: string;
  normalizedText: string;
  letterCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
}

// ─── Singleton Cache ─────────────────────────────────────────────

let cachedSentences: TargetSentence[] | null = null;

/**
 * Load and cache all sentences from the JSON data file.
 * Returns the cached array on subsequent calls.
 */
export function loadSentences(): TargetSentence[] {
  if (cachedSentences) return cachedSentences;

  const filePath = join(process.cwd(), 'public', 'data', 'rmhbox', 'human-keyboard', 'sentences.json');
  const raw = readFileSync(filePath, 'utf-8');
  cachedSentences = JSON.parse(raw) as TargetSentence[];
  return cachedSentences;
}

/**
 * Select a sentence appropriate for the given player count.
 *
 * Fewer players → longer sentences (each player has more keys, can type faster).
 * More players → shorter sentences (coordination is harder with many players).
 *
 * @param pool     All available sentences
 * @param playerCount  Number of active players
 * @param usedIds  Set of sentence IDs already used this session (to avoid repeats)
 */
export function selectSentenceForGame(
  pool: TargetSentence[],
  playerCount: number,
  usedIds: Set<string>,
): TargetSentence {
  // Filter out used sentences
  let available = pool.filter((s) => !usedIds.has(s.id));
  if (available.length === 0) {
    available = pool; // fallback: reuse if all exhausted
  }

  // Determine preferred difficulty based on player count
  let preferredDifficulty: 'easy' | 'medium' | 'hard';
  if (playerCount <= 4) {
    preferredDifficulty = 'hard'; // fewer players = longer sentence OK
  } else if (playerCount <= 7) {
    preferredDifficulty = 'medium';
  } else {
    preferredDifficulty = 'easy'; // many players = shorter sentence
  }

  // Try preferred difficulty first, then fallback to any
  let candidates = available.filter((s) => s.difficulty === preferredDifficulty);
  if (candidates.length === 0) {
    candidates = available;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}
