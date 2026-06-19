import { test, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateChapter } from '../manuscript/validate';

const MS = join(dirname(fileURLToPath(import.meta.url)), '..', 'manuscript');

test.runIf(existsSync(join(MS, 'ch01.json')))('all chapters validate and number contiguously', () => {
  const files = readdirSync(MS).filter((f) => /^ch\d+\.json$/.test(f)).sort();
  expect(files.length).toBeGreaterThanOrEqual(9);
  const chapters = files.map((f) => validateChapter(JSON.parse(readFileSync(join(MS, f), 'utf8'))));
  chapters.forEach((c, i) => expect(c.n).toBe(i + 1));

  // enough Chinese text across the book to reach ~100 pages once paginated
  const totalZh = chapters.reduce(
    (s, c) =>
      s +
      c.passages.reduce(
        (t, p: any) => t + (Array.isArray(p.zh) ? p.zh.join('').length : (p.zh?.length ?? 0)),
        0,
      ),
    0,
  );
  expect(totalZh).toBeGreaterThan(8000);
});
