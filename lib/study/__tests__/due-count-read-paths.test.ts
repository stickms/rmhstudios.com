import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUE_COUNT_READ_PATHS } from '@/lib/study/queue';

/**
 * Suspension is only real if every place that counts or queues due cards honours it. Each registered path
 * applies the shared `ACTIVE_REVIEW_WHERE`, or, for a raw count, `"suspendedAt" IS NULL`; and no other server
 * file reads review due dates without being on the list.
 */
const ROOT = join(__dirname, '..', '..', '..');
const APPLIES = /ACTIVE_REVIEW_WHERE|"suspendedAt" IS NULL/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.server\.ts$/.test(name) || /\/app\/routes\/api\/.*\.ts$/.test(full)) out.push(full);
  }
  return out;
}

describe('DUE_COUNT_READ_PATHS', () => {
  it.each([...DUE_COUNT_READ_PATHS])('%s applies the suspension filter', (path) => {
    const src = readFileSync(join(ROOT, path), 'utf8');
    expect(src).toMatch(APPLIES);
  });

  it('lists files that exist, once each', () => {
    expect(new Set(DUE_COUNT_READ_PATHS).size).toBe(DUE_COUNT_READ_PATHS.length);
    for (const p of DUE_COUNT_READ_PATHS) expect(() => statSync(join(ROOT, p))).not.toThrow();
  });

  it('covers every server file that reads review due dates', () => {
    // Writers of the schedule (the grade path) and unrelated "dueAt" fields are not counts.
    const WRITERS = new Set([
      'lib/study/review-log.server.ts',
      'lib/study/review.server.ts',
      'lib/study/api/study.cards.$id.review.server.ts',
      'lib/history/resume.server.ts',
      // One card's own schedule, shown to its member whatever its state (a suspended card included); never a count or a queue.
      'lib/study/card-history.server.ts',
    ]);
    const listed = new Set<string>(DUE_COUNT_READ_PATHS);
    const readers = walk(join(ROOT, 'lib'))
      .concat(walk(join(ROOT, 'app')))
      .map((f) => f.slice(ROOT.length + 1))
      .filter((f) => {
        const src = readFileSync(join(ROOT, f), 'utf8');
        return /dueAt/.test(src) && /flashcardReview|flashcard_review/.test(src);
      })
      .filter((f) => !WRITERS.has(f));
    expect(readers.filter((f) => !listed.has(f))).toEqual([]);
  });
});
