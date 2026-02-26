/**
 * RMHbox — Emoji Cinema Data Loader
 *
 * Loads and caches movies from static JSON files.
 * Provides selection logic for picking movies for each game.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §4.3
 */

import path from 'path';
import fs from 'fs';
import { EC_MAX_ROUNDS } from '../constants';

// ─── Types ───────────────────────────────────────────────────────

export interface MovieEntry {
  title: string;
  titleNormalized: string;
  alternativeTitles: string[];
  year: number;
  genre: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  popularity: number;
}

export interface ECRoundData {
  movie: MovieEntry;
  producerUserId: string;
}

// ─── Singleton Caches ────────────────────────────────────────────

let cachedMovies: MovieEntry[] | null = null;

/**
 * Load movies from the static JSON file.
 * Caches the result as a singleton for subsequent calls.
 */
export function loadMovies(): MovieEntry[] {
  if (cachedMovies) return cachedMovies;

  const filePath = path.join(process.cwd(), 'data/rmhbox/emoji-cinema/movies.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedMovies = JSON.parse(raw) as MovieEntry[];
  return cachedMovies;
}

/**
 * Select movies for a game, assigning each to a Producer in rotation.
 * Selects min(playerCount, EC_MAX_ROUNDS) movies, excludes used IDs.
 */
export function selectMoviesForGame(
  pool: MovieEntry[],
  playerCount: number,
  usedTitles: Set<string>,
  producerOrder: string[],
): ECRoundData[] {
  const totalRounds = Math.min(playerCount, EC_MAX_ROUNDS);
  const available = pool.filter((m) => !usedTitles.has(m.title));
  const selection = available.length >= totalRounds ? available : pool;

  // Fisher-Yates shuffle and pick
  const shuffled = [...selection];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, totalRounds);

  return selected.map((movie, i) => ({
    movie,
    producerUserId: producerOrder[i],
  }));
}

/**
 * Validate that a string is a valid emoji character (Unicode grapheme cluster).
 * We no longer restrict to a static palette — emoji-mart handles the UI selection.
 * Server-side validation ensures the input is actually an emoji, not arbitrary text.
 */
export function validateEmoji(emoji: string): boolean {
  if (!emoji || typeof emoji !== 'string') return false;
  // Accept any non-empty string that is <= 8 chars (emoji grapheme clusters can be multi-codepoint)
  if (emoji.length > 8) return false;
  // Must contain at least one emoji codepoint (U+2000+ range covers most emoji)
  // This regex matches common emoji ranges: emoticons, dingbats, symbols, supplementary
  const emojiPattern = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2300}-\u{23FF}]|[\u{FE00}-\u{FEFF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/u;
  return emojiPattern.test(emoji);
}
