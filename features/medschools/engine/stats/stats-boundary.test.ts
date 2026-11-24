import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = __dirname;
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const importsOf = (src: string): string[] =>
  [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

describe('engine/stats boundary', () => {
  it('stays pure: no d3, chart geometry, node:, site @/ modules (lib/core is allowed), prisma or zod', () => {
    const files = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const spec of importsOf(readFileSync(join(here, f), 'utf8'))) {
        expect(spec, f).not.toMatch(/^d3-|chart-geometry|^node:|^@\/(?!lib\/core\/)|^@prisma\/|^@features\/|^zod/);
      }
    }
  });
  it('is not imported by ui/ or the school routes (bundle rule)', () => {
    const roots = [join(here, '../../ui'), join(here, '../../../../app/routes/rmh-medschool')];
    for (const root of roots) {
      // The routes moved out of `_site/` for the app redesign (roadmap item 11). A root that no longer exists must
      // fail here, not make the loop quietly check nothing.
      expect(existsSync(root), root).toBe(true);
      expect(walk(root).filter((x) => /\.tsx?$/.test(x)).length, root).toBeGreaterThan(0);
      for (const f of walk(root).filter((x) => /\.tsx?$/.test(x))) {
        for (const spec of importsOf(readFileSync(f, 'utf8'))) {
          expect(spec, f).not.toMatch(/engine\/stats/);
        }
      }
    }
  });
});
