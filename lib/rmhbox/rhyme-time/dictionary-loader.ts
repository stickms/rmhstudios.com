/**
 * Rhyme Time — Dictionary Loader
 *
 * Loads curated root words from root-words.json and provides runtime
 * rhyme detection via the `rhyming-part` package (which wraps the CMU
 * Pronouncing Dictionary internally). No pre-generated rhyme dictionary
 * is needed — rhyme matching is computed on-the-fly.
 */

import fs from 'fs';
import path from 'path';
import rhymingPart from 'rhyming-part';
import { syllable } from 'syllable';

// ─── Types ───────────────────────────────────────────────────────

export interface RootWord {
  word: string;
  phonetic: string;
  syllableCount: number;
  rhymeEndSound: string;
  knownRhymeCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ─── Singleton Cache ─────────────────────────────────────────────

let cachedRootWords: RootWord[] | null = null;

const DATA_DIR = path.join(process.cwd(), 'public', 'data', 'rmhbox', 'rhyme-time');

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

// ─── Runtime Rhyme Detection ─────────────────────────────────────

/**
 * Checks whether a submitted word is a valid rhyme for the given root word.
 *
 * A word is a valid rhyme if:
 *  - It exists in the CMU dictionary (rhymingPart returns non-empty)
 *  - Any of its rhyming parts overlaps with any of the root word's rhyming parts
 *    (handles words with multiple pronunciations in the CMU dictionary)
 *  - It is not the root word itself
 */
export function isValidRhyme(word: string, rootWord: string): boolean {
  if (word === rootWord) return false;
  const wordParts = rhymingPart(word, { multiple: true }) as string[];
  if (!wordParts || wordParts.length === 0) return false; // word not in dictionary
  const rootParts = rhymingPart(rootWord, { multiple: true }) as string[];
  if (!rootParts || rootParts.length === 0) return false;
  return wordParts.some((wp) => rootParts.includes(wp));
}

/**
 * Checks whether a word qualifies for the multi-syllable rhyme bonus.
 * A multi-syllable rhyme has syllableCount >= rootWord.syllableCount + 1.
 */
export function isMultiSyllableRhyme(word: string, rootSyllableCount: number): boolean {
  return syllable(word) >= rootSyllableCount + 1;
}

/**
 * Returns whether a word exists in the CMU Pronouncing Dictionary
 * (i.e., is a known English word for rhyme purposes).
 */
export function isKnownWord(word: string): boolean {
  return rhymingPart(word) !== '';
}

/** Resets the root words cache (for testing purposes only). */
export function _resetCache(): void {
  cachedRootWords = null;
}
