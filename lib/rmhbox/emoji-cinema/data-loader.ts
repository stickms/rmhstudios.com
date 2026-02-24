/**
 * RMHbox — Emoji Cinema Data Loader
 *
 * Loads and caches movies and emoji palette from static JSON files.
 * Provides selection logic for picking movies and validating emojis.
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

export interface EmojiCategory {
  name: string;
  emojis: string[];
}

export interface EmojiPalette {
  categories: EmojiCategory[];
}

export interface ECRoundData {
  movie: MovieEntry;
  producerUserId: string;
}

// ─── Singleton Caches ────────────────────────────────────────────

let cachedMovies: MovieEntry[] | null = null;
let cachedPalette: EmojiPalette | null = null;
/** Flat set of all allowed emojis for fast validation. */
let cachedEmojiSet: Set<string> | null = null;
let cachedEmojiPaletteRef: EmojiPalette | null = null;

/**
 * Load movies from the static JSON file.
 * Caches the result as a singleton for subsequent calls.
 */
export function loadMovies(): MovieEntry[] {
  if (cachedMovies) return cachedMovies;

  const filePath = path.join(process.cwd(), 'public/data/rmhbox/emoji-cinema/movies.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedMovies = JSON.parse(raw) as MovieEntry[];
  return cachedMovies;
}

/**
 * Load the curated emoji palette from the static JSON file.
 * Caches the result as a singleton.
 */
export function loadEmojiPalette(): EmojiPalette {
  if (cachedPalette) return cachedPalette;

  const filePath = path.join(process.cwd(), 'public/data/rmhbox/emoji-cinema/emoji-palette.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedPalette = JSON.parse(raw) as EmojiPalette;
  return cachedPalette;
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
 * Validate that an emoji is in the curated palette.
 */
export function validateEmoji(emoji: string, palette: EmojiPalette): boolean {
  if (!cachedEmojiSet || cachedEmojiPaletteRef !== palette) {
    cachedEmojiSet = new Set<string>();
    cachedEmojiPaletteRef = palette;
    for (const cat of palette.categories) {
      for (const e of cat.emojis) {
        cachedEmojiSet.add(e);
      }
    }
  }
  return cachedEmojiSet.has(emoji);
}
