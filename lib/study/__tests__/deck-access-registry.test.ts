/**
 * The one access rule for a flashcard deck (s11-10) is only the rule if no server file decides ownership its own way.
 * `DECK_ACCESS_PATHS` lists every file that filters decks by their owner, as `role` (the file lets an accepted editor in
 * through `deckRole` or a filter built on it) or `owner-only` (with the reason). This scan reads the source tree with
 * comments stripped and fails a file that filters `flashcardDeck`, or a card's `deck:`, by `userId` and is in neither
 * list, a listed file the scan no longer finds, and a `role` file that never calls the rule.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECK_ACCESS_PATHS } from '@/lib/study/deck-access';

const ROOT = join(__dirname, '..', '..', '..');

/** Source with block comments and line comments removed (a `//` after `:` is a URL, not a comment). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.git', '__tests__', 'generated', 'dist', '.output', '.cache', 'locales'].includes(name))
        continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.gen.ts')) {
        out.push(relative(ROOT, path));
      }
    }
  };
  for (const dir of ['lib', 'app', 'components', 'features', 'server']) walk(join(ROOT, dir));
  return out;
}

/** The text of the balanced `(…)` that opens at `open` (the index of the `(`). */
function callArguments(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** Whether the source filters decks by `userId`: a `flashcardDeck.<op>(…)` whose arguments name it, a card's `deck:` filter, or raw SQL on `flashcard_deck`. */
export function filtersDecksByOwner(raw: string): boolean {
  const src = stripComments(raw);
  const op =
    /\bflashcardDeck\.(findFirst|findMany|findUnique|count|updateMany|deleteMany|update|delete|aggregate|groupBy)\(/g;
  for (const m of src.matchAll(op)) {
    if (/\buserId\b/.test(callArguments(src, m.index! + m[0].length - 1))) return true;
  }
  if (/\bdeck:\s*(\{[^}]*\buserId\b|\w+\([^)]*\buserId\b)/.test(src)) return true;
  return /flashcard_deck/.test(src) && /"userId"/.test(src);
}

// `deck_editor` is the rule's own table, for the raw SQL that cannot call a helper.
const ROLE_RULE = /\b(deckRole|requireDeckRole|studiedDeckWhere|readableDeckWhere|canReadDeck|deck_editor)\b/;

describe('DECK_ACCESS_PATHS', () => {
  const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
  const files = sourceFiles();

  it('lists every server file that filters decks by their owner', () => {
    const found = files.filter((file) => filtersDecksByOwner(read(file)));
    const unlisted = found.filter((file) => !(file in DECK_ACCESS_PATHS));
    expect(
      unlisted,
      `these files filter decks by userId but are in neither list of DECK_ACCESS_PATHS: ${unlisted.join(', ')}`,
    ).toEqual([]);
  });

  it('lists only files that exist and still filter decks by their owner', () => {
    for (const file of Object.keys(DECK_ACCESS_PATHS)) {
      expect(files, `${file} is listed but does not exist`).toContain(file);
      expect(filtersDecksByOwner(read(file)), `${file} is listed but no longer filters decks by userId`).toBe(true);
    }
  });

  it('gives every file a reason, and every `role` file calls the rule', () => {
    for (const [file, entry] of Object.entries(DECK_ACCESS_PATHS)) {
      expect(entry.reason.trim().length, file).toBeGreaterThan(20);
      if (entry.access === 'role') {
        expect(stripComments(read(file)), `${file} is "role" but never calls the access rule`).toMatch(ROLE_RULE);
      }
    }
  });

  it('keeps an owner-only file from handing an editor an owner power', () => {
    // These files change what only the owner may: none of them may import the editor's side of the rule and use it to
    // let someone else in. (A `role` file checks `deckRole`; an `owner-only` file filters by the deck's `userId`.)
    for (const [file, entry] of Object.entries(DECK_ACCESS_PATHS)) {
      if (entry.access !== 'owner-only') continue;
      const src = stripComments(read(file));
      expect(src, `${file} is "owner-only" but lets an editor in`).not.toMatch(
        /\b(studiedDeckWhere|readableDeckWhere)\b/,
      );
    }
  });

  it('keeps every owner-only setting out of an editor’s reach in deck-editor.server', () => {
    const src = stripComments(read('lib/study/deck-editor.server.ts'));
    for (const fn of ['deleteDeck', 'updateDeck']) {
      const start = src.indexOf(`export async function ${fn}`);
      const body = src.slice(start, src.indexOf('\nexport ', start + 10));
      expect(body, fn).not.toMatch(/deckRole|requireDeckRole/);
      expect(body, fn).toMatch(/where: \{ id: deckId, userId \}/);
    }
  });
});
