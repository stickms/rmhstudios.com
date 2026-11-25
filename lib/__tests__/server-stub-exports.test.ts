/**
 * The client build replaces every `*.server.*` module with a stub that exports the same names as `undefined`
 * (`stubServerFiles` in vite.shared.ts). The stub must be valid JavaScript for every export form a server module
 * uses, or the whole client build fails: sprint 14's `lib/cached.server.ts` re-exported an inline type
 * (`export { lruL1, type LruL1Options } from …`) and the stub came out as `export const type LruL1Options`.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stubServerFiles } from '../../vite.shared';

function stubOf(source: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'server-stub-')), 'mod.server.ts');
  writeFileSync(file, source);
  const load = stubServerFiles().load as (id: string) => string | null;
  return load(`\0server-stub:${file}`) ?? '';
}

describe('the client stub of a server module', () => {
  it('exports every value name, and nothing for an inline type specifier', () => {
    const out = stubOf(
      [
        "export { estimateBytes, LruL1 as Engine, type LruL1Options } from './cache-l1';",
        'export type { Other } from "./other";',
        'export const a = 1;',
        'export async function b() {}',
        'export type C = string;',
      ].join('\n'),
    );
    expect(out.split('\n').sort()).toEqual(
      [
        'export const Engine = undefined;',
        'export const a = undefined;',
        'export const b = undefined;',
        'export const estimateBytes = undefined;',
      ].sort(),
    );
    expect(out).not.toMatch(/\btype\b/);
  });

  it('is valid JavaScript for the real lib/cached.server.ts', () => {
    const out = stubOf(readFileSync(join(__dirname, '..', 'cached.server.ts'), 'utf8'));
    expect(() => new Function(out.replace(/^export /gm, ''))).not.toThrow();
    expect(out).toContain('export const lruL1 = undefined;');
  });
});
