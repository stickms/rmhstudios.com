import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = 'features/medschools';
const ENGINE = join(ROOT, 'engine/secondaries');
/** The only files of this folder the client may import (pure and tiny). */
const CLIENT_SAFE = new Set(['cycle-ranges', 'theme-ids']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const importsOf = (src: string): string[] =>
  [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

describe('engine/secondaries boundaries', () => {
  const engineFiles = readdirSync(ENGINE).filter((f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f));

  it('has the engine files (so the checks below are not vacuous)', () => {
    for (const f of [
      'types',
      'text',
      'scrub',
      'similarity',
      'themes',
      'theme-ids',
      'cycle-ranges',
      'view',
      'overlap',
    ]) {
      expect(engineFiles).toContain(`${f}.ts`);
    }
  });

  it('the engine is pure TS: no node:, d3, prisma, zod or alias imports; relative imports stay in the engine', () => {
    for (const f of engineFiles) {
      for (const spec of importsOf(readFileSync(join(ENGINE, f), 'utf8'))) {
        expect(spec, `${f}: ${spec}`).not.toMatch(/^(node:|d3|@prisma\/|zod$|@\/|@features\/)/);
        if (spec.startsWith('.')) {
          expect(/^\.\.?\//.test(spec), `${f}: ${spec}`).toBe(true);
          expect(spec, `${f}: ${spec}`).not.toMatch(/(?:^|\/)(?:api|scrape|ui)\//);
        }
      }
    }
  });

  it('the client imports only cycle-ranges and theme-ids from engine/secondaries', () => {
    const offenders: string[] = [];
    const dirs = [join(ROOT, 'ui'), 'app/routes/_site/rmh-medschool'].filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        if (!/\.(ts|tsx)$/.test(file) || /\.test\.(ts|tsx)$/.test(file)) continue;
        for (const spec of importsOf(readFileSync(file, 'utf8'))) {
          const m = /engine\/secondaries\/([\w-]+)/.exec(spec);
          if (m && !CLIENT_SAFE.has(m[1] ?? '')) offenders.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
