/**
 * The registry of every place a match becomes ready (s07-06), held by a source
 * scan the way `QUIET_COUNT_READ_PATHS` is: each listed function exists and calls
 * its deadline stamp, and every place a tournament source writes a READY match
 * sits inside a listed function. A new path that makes a match ready without
 * being listed (and stamping) fails here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATCH_READY_PATHS } from '@/lib/tournaments/scheduling';

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** The text of top-level function `name` (from its declaration to the next top-level function or the end). */
function body(src: string, name: string): string | null {
  const decl = new RegExp(`^(?:export )?(?:async )?function ${name}\\b`, 'm').exec(src);
  if (!decl) return null;
  const rest = src.slice(decl.index + decl[0].length);
  const next = /^(?:export )?(?:async )?function \w+/m.exec(rest);
  return src.slice(decl.index, decl.index + decl[0].length + (next ? next.index : rest.length));
}

/** The name of the top-level function a character offset sits in. */
function enclosing(src: string, offset: number): string | null {
  let name: string | null = null;
  const re = /^(?:export )?(?:async )?function (\w+)/gm;
  for (let m = re.exec(src); m && m.index <= offset; m = re.exec(src)) name = m[1]!;
  return name;
}

describe('MATCH_READY_PATHS', () => {
  it('lists each path once', () => {
    const keys = MATCH_READY_PATHS.map((p) => `${p.file}#${p.fn}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(MATCH_READY_PATHS.map((p) => [`${p.file}#${p.fn}`, p] as const))('%s stamps its deadline', (_name, path) => {
    const fn = body(read(path.file), path.fn);
    expect(fn, `${path.fn} not found in ${path.file}`).not.toBeNull();
    expect(fn).toContain(path.call);
  });

  it('every write of a READY match in the tournament sources sits in a listed path', () => {
    const dir = 'lib/tournaments';
    // `bracket.ts` is the pure generator: it only describes the rows `startTournament` (listed) persists.
    const PURE = new Set(['bracket.ts']);
    const files = readdirSync(join(ROOT, dir)).filter(
      (f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !PURE.has(f),
    );
    const listed = new Set(MATCH_READY_PATHS.map((p) => `${dir}/${p.file.split('/').pop()}#${p.fn}`));
    const writes: string[] = [];
    for (const f of files) {
      const src = read(`${dir}/${f}`);
      // `state: 'READY'` (a create or update), `'READY' as const` and `? 'READY'` (a computed state).
      const re = /state:\s*'READY'|\?\s*'READY'|'READY'\s+as const/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        // A `where: { state: 'READY' }` filter reads; only a data write counts.
        const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
        const before = src.slice(Math.max(0, m.index - 120), m.index);
        if (/where:\s*\{[^}]*$/.test(before) || /where:/.test(line)) continue;
        writes.push(`${dir}/${f}#${enclosing(src, m.index)}`);
      }
    }
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(listed, `unlisted READY write: ${w}`).toContain(w);
  });

  it('the stamp helpers import no tournament module (no import cycle with tournament.server)', () => {
    const src = read('lib/tournaments/deadline.server.ts');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['@prisma/client', '@/lib/tournaments/scheduling']);
    const ts = read('lib/tournaments/tournament.server.ts');
    expect(ts).not.toMatch(/from '\.\/scheduling\.server'/);
    expect(ts).not.toMatch(/from '\.\/match-results\.server'/);
  });
});
