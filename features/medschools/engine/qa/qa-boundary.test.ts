import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = __dirname;
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const importLines = (src: string): string[] =>
  src.split('\n').filter((l) => /^\s*(import|export)\b.*from\s|^\s*import\s*\(/.test(l));
const specOf = (line: string): string => /['"]([^'"]+)['"]/.exec(line)?.[1] ?? '';

describe('engine/qa boundary', () => {
  it('stays pure: no zod, prisma, node:, d3, react or site modules', () => {
    const files = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files).toEqual(expect.arrayContaining(['numbers.ts', 'ground.ts', 'types.ts']));
    for (const f of files) {
      for (const line of importLines(readFileSync(join(here, f), 'utf8'))) {
        expect(specOf(line), f).not.toMatch(
          /^zod|^@prisma\/|^@\/lib\/prisma|^node:|^d3-|^react|chart-geometry|^@\/(?!lib\/core\/)|^@features\//,
        );
      }
    }
  });
  it('is imported by ui/ only as a type', () => {
    for (const f of walk(join(here, '../../ui')).filter((x) => /\.tsx?$/.test(x))) {
      for (const line of importLines(readFileSync(f, 'utf8'))) {
        if (/engine\/qa/.test(specOf(line))) expect(line, f).toMatch(/\bimport\s+type\b/);
      }
    }
  });
});
