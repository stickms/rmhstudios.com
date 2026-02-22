/**
 * Rhyme Time — Dictionary Loader
 *
 * Loads and caches root-words.json and rhyme-dictionary.json from
 * public/data/rmhbox/rhyme-time/ at server init. Uses singleton pattern
 * to ensure data is only parsed once.
 */

import fs from 'fs';
import path from 'path';

export interface RootWord {
  word: string;
  phonetic: string;
  syllableCount: number;
  rhymeEndSound: string;
  knownRhymeCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface RhymeEntry {
  word: string;
  syllableCount: number;
  frequencyRank: number;
  isMultiSyllableRhyme: boolean;
}

let cachedRhymeDictionary: Map<string, RhymeEntry[]> | null = null;
let cachedRootWords: RootWord[] | null = null;

const DATA_DIR = path.join(process.cwd(), 'public', 'data', 'rmhbox', 'rhyme-time');

/**
 * Loads and returns the rhyme dictionary from rhyme-dictionary.json.
 * Cached as a singleton — subsequent calls return the same Map reference.
 */
export function loadRhymeDictionary(): Map<string, RhymeEntry[]> {
  if (cachedRhymeDictionary) return cachedRhymeDictionary;
  const raw = fs.readFileSync(path.join(DATA_DIR, 'rhyme-dictionary.json'), 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, RhymeEntry[]>;
  cachedRhymeDictionary = new Map(Object.entries(parsed));
  return cachedRhymeDictionary;
}

/**
 * Loads and returns the root words from root-words.json.
 * Cached as a singleton — subsequent calls return the same array reference.
 */
export function loadRootWords(): RootWord[] {
  if (cachedRootWords) return cachedRootWords;
  const raw = fs.readFileSync(path.join(DATA_DIR, 'root-words.json'), 'utf-8');
  cachedRootWords = JSON.parse(raw) as RootWord[];
  return cachedRootWords;
}

/** Resets the caches (for testing purposes only). */
export function _resetCache(): void {
  cachedRhymeDictionary = null;
  cachedRootWords = null;
}
