/**
 * RMHbox — Human Keyboard data loader.
 *
 * The bundled sentences (`data/rmhbox/human-keyboard/sentences.json`) are read
 * once per process and cached; the identity-crisis loader has the same shape.
 * Server-side only: the list never ships to a client.
 */

import path from 'path';
import fs from 'fs';
import { isValidSentenceText } from './rules';
import type { Difficulty, Sentence } from './rules';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

let cached: Sentence[] | null = null;

function isSentence(value: unknown): value is Sentence {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    isValidSentenceText(v.text) &&
    typeof v.category === 'string' &&
    typeof v.difficulty === 'string' &&
    (DIFFICULTIES as readonly string[]).includes(v.difficulty)
  );
}

/** Parse the file's text; entries of the wrong shape are dropped. */
export function parseSentences(raw: string): Sentence[] {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isSentence) : [];
}

/** Load the sentences from the static JSON file, cached for later calls. */
export function loadSentences(): Sentence[] {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), 'data/rmhbox/human-keyboard/sentences.json');
  cached = parseSentences(fs.readFileSync(filePath, 'utf-8'));
  return cached;
}
