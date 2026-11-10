/**
 * Ad-hoc TTL maps only go DOWN (redesign audit C4).
 *
 * The one cache helper is `lib/cached.server.ts` (`cached()`, tags, `lruL1()`). A
 * hand-rolled `const cache = new Map()` next to a `TTL_MS` constant has no size
 * bound, no single-flight, no cross-process invalidation and no metrics, and each
 * one is another place a stale value can hide. Existing ones are a backlog, not
 * a mass migration; new ones are not allowed.
 *
 * Heuristic (deliberately simple, so it is cheap to run and easy to read):
 * a non-test `.ts`/`.tsx` file under app/, lib/ or server/ counts once when it has
 *  - a MODULE-LEVEL `new Map(` — a line that starts at column 0 with
 *    `[export] const|let <name>[: type] = new Map` — AND
 *  - a `TTL`, `ttl` or `expiresAt` identifier anywhere in the file.
 * It over-counts files that merely hold a Map beside an unrelated TTL and under-counts
 * maps built inside a class or a factory; both are fine for a ratchet, which only
 * needs the number to be stable and to move when someone adds or removes a cache.
 *
 * The helper itself (lib/cached.server.ts) is excluded.
 *
 * One-directional, like the other backlogs in this folder:
 *  - a NEW ad-hoc map fails (count above the baseline) — use `cached()` / `lruL1()`;
 *  - migrating some fails too until BASELINE is lowered to the new count.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Lower this when you migrate files. Never raise it. */
const BASELINE = 64;

const MODULE_MAP = /^(?:export\s+)?(?:const|let)\s+\w+\s*(?::[^=\n]+)?=\s*new Map\b/m;
const TTL_WORD = /\b(?:\w*TTL\w*|\w*[tT]tl\w*|expiresAt)\b/;

function count(): { total: number; files: string[] } {
  const files = globSync('{app,lib,server,features}/**/*.{ts,tsx}').filter(
    (f) =>
      !/node_modules|__tests__|\.test\.|routeTree\.gen|^lib\/cached\.server\.ts$|generated/.test(f),
  );
  const hits: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (MODULE_MAP.test(src) && TTL_WORD.test(src)) hits.push(f);
  }
  hits.sort();
  return { total: hits.length, files: hits };
}

describe('ad-hoc TTL map ratchet', () => {
  it('does not grow and is lowered as it shrinks', () => {
    const { total, files } = count();
    expect(
      total,
      `module-level Map + TTL files: ${total}, baseline ${BASELINE}.\n` +
        (total > BASELINE
          ? "  A new hand-rolled TTL map: use cached()/lruL1() from '@/lib/cached.server' (see lib/CLAUDE.md §Caching).\n" +
            `  Files: ${files.join(', ')}`
          : `  You migrated some: lower BASELINE in this file to ${total}.`),
    ).toBe(BASELINE);
  });
});
