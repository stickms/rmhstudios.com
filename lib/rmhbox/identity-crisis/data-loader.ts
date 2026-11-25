/**
 * RMHbox — Identity Crisis data loader.
 *
 * The bundled identities (`data/rmhbox/identity-crisis/identities.json`) are
 * read once per process and cached; the emoji-cinema loader has the same shape.
 * Server-side only: the list never ships to a client.
 */

import path from 'path';
import fs from 'fs';
import type { Difficulty, Identity } from './rules';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

let cached: Identity[] | null = null;

function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.aliases) &&
    v.aliases.every((a) => typeof a === 'string') &&
    typeof v.category === 'string' &&
    typeof v.difficulty === 'string' &&
    (DIFFICULTIES as readonly string[]).includes(v.difficulty)
  );
}

/** Parse the file's text; entries of the wrong shape are dropped. */
export function parseIdentities(raw: string): Identity[] {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isIdentity) : [];
}

/** Load the identities from the static JSON file, cached for later calls. */
export function loadIdentities(): Identity[] {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), 'data/rmhbox/identity-crisis/identities.json');
  cached = parseIdentities(fs.readFileSync(filePath, 'utf-8'));
  return cached;
}
