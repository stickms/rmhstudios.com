import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The tracker import keeps nothing about a file or its text: it is read in memory, sent to the model, and gone. These
 * read the source, because the thing to hold is the absence of a call. The one write is the tracker rows the member
 * saved, and that goes through the share-sync writer (`share-ratchet.test.ts`).
 */
const files = [
  ...globSync('features/medschools/api/import/*.ts'),
  'features/medschools/api/medschools.me.tracker.import.parse.server.ts',
  'features/medschools/api/medschools.me.tracker.import.save.server.ts',
  'features/medschools/api/import-schemas.ts',
]
  .map(String)
  .filter((f) => !/\.test\./.test(f))
  .sort();
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('tracker import privacy pins', () => {
  it('finds the files', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('writes nothing: no create, update, upsert, delete or raw write on any model', () => {
    for (const f of files) {
      expect(code(f), f).not.toMatch(/\b(prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      expect(code(f), f).not.toMatch(/\$executeRaw|\$queryRawUnsafe|writeFile|createWriteStream|appendFile/);
    }
  });

  it('caches nothing about a file: the one cache is the school directory under a constant key', () => {
    for (const f of files) {
      const src = code(f);
      if (f.endsWith('directory.server.ts')) {
        // The key is one constant string (never built from input), read through KEY for the fresh reload too.
        expect(src).toMatch(/const KEY = 'medschools:import:directory';/);
        expect(src).toMatch(/cached<Loaded>\(\s*KEY,/);
        expect(src).not.toMatch(/KEY\s*[+`]|`medschools:import/);
        continue;
      }
      expect(src, f).not.toMatch(/\bcached\w*\(|\blruL1\(|microCache|putL1\(|redis/i);
    }
  });

  it('logs no text: a console call never mentions the text, the file, rows or the output', () => {
    for (const f of files) {
      for (const m of code(f).matchAll(/console\.\w+\(([^;]*)\)/g)) {
        expect(m[1], `${f}: ${m[0]}`).not.toMatch(/\b(text|file|filename|buffer|raw|rows?|output|prompt|milestones?)\b/i);
      }
    }
  });

  it('the file name is carried only to the extension check', () => {
    const named = files.filter((f) => /filename/.test(code(f))).map((f) => f.split('/').pop())
      .sort();
    expect(named).toEqual(['extract.server.ts', 'medschools.me.tracker.import.parse.server.ts', 'parse.server.ts'].sort());
  });

  it('the parse endpoint declares no cache and says no-store', () => {
    const src = code('features/medschools/api/medschools.me.tracker.import.parse.server.ts');
    expect(src).not.toMatch(/\bcache\s*:/);
    expect(src).toContain("'no-store'");
  });
});
