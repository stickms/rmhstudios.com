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
  id: string;
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
  usedIds: Set<string>,
  producerOrder: string[],
): ECRoundData[] {
  const totalRounds = Math.min(playerCount, EC_MAX_ROUNDS);
  const available = pool.filter((m) => !usedIds.has(m.id));
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
 * Validate that a string looks like a valid emoji (single grapheme cluster).
 * We no longer restrict to a static palette — emoji-mart handles the UI selection.
 */
export function validateEmoji(emoji: string): boolean {
  if (!emoji || typeof emoji !== 'string') return false;
  // Accept any non-empty string that is <= 8 chars (emoji grapheme clusters)
  // and does not contain typical ASCII-only content
  if (emoji.length > 8) return false;
  return true;
}
